// Diagnóstico y backfill del ancla del ciclo de pases (ver cicloPlanDesde /
// anclaCicloPlan en @/lib/helpers/clientes). SOLO LECTURA: imprime el SQL,
// no lo aplica — va pegado en el SQL Editor de Supabase.
//
// El problema que cierra: un cliente con plan y `fecha_contratacion` en null
// obliga a periodoPlan a DEDUCIR el borde del ciclo del vencimiento
// (`vencimiento + 1 día`). Esa deducción no es inversa de finCicloPlan cuando
// el día quedó recortado (anclas 29/30/31 sobre un mes más corto): ahí la
// ventana de pases queda corrida un mes y el mesón le niega el ingreso a un
// cliente que pagó — caso HYRL56, 31-ago-2026. Y no se puede arreglar del lado
// de la deducción: un vencimiento 30-sep es igual de compatible con una
// contratación el 31-ago que con una el 1-sep.
//
// El código ya no crea filas así (todo camino que arranca un ciclo pasa por
// cicloPlanDesde). Esto es para las filas viejas: mientras quede una sin ancla,
// la deducción sigue viva. Con la lista en cero, deja de existir el caso.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-ancla-ciclo.mts
import postgres from "postgres";
import { anclaCicloPlan, finCicloPlan, periodoPlan, sigueVigenteHoy } from "@/lib/helpers/clientes";
import { diaEnSantiago } from "@/lib/helpers/fechas";
import { pasesIncluidos, planVigente } from "@/lib/helpers/precios";
import { TIPOS_VENTA_PLAN } from "@/lib/helpers/ventas";
import type { Cliente } from "@/types";

type ClienteCiclo = Pick<Cliente, "id" | "plan" | "ilimitadoHasta" | "fechaContratacion" | "vencimiento">;

/** ¿El vencimiento cae el último día de su mes en Chile? Es el único caso en
 * que deducir el ancla del vencimiento es ambiguo (ver más abajo). */
function esUltimoDiaDelMes(vencimiento: string): boolean {
  const dia = diaEnSantiago(vencimiento);
  if (!dia) return false;
  const siguiente = new Date(dia);
  siguiente.setDate(siguiente.getDate() + 1);
  return siguiente.getMonth() !== dia.getMonth();
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const clientes = await sql`
  select id, nombre, patente, plan, vencimiento, fecha_contratacion, ilimitado_hasta
  from clientes where plan is not null and vencimiento is not null`;
const ingresos = await sql<{ cliente_id: string | null; fecha: string }[]>`
  select cliente_id, fecha from ingresos where fecha > now() - interval '200 days'`;
// Sin recorte de fechas: el ancla de un cliente viejo puede estar en la venta
// que contrató su plan hace un año, y es justamente la que hay que recuperar.
const ventas = await sql<{ cliente_id: string | null; fecha: string; tipo: string }[]>`
  select cliente_id, fecha, tipo from ventas where plan <> ''`;

const porCliente = <T extends { cliente_id: string | null }>(filas: T[]) => {
  const m = new Map<string, T[]>();
  for (const f of filas) if (f.cliente_id) m.set(f.cliente_id, [...(m.get(f.cliente_id) ?? []), f]);
  return m;
};
const ingresosPorCliente = porCliente(ingresos);
const ventasPorCliente = porCliente(ventas);

const bloqueados: Record<string, unknown>[] = [];
const sinAncla: Record<string, unknown>[] = [];

for (const c of clientes) {
  if (!sigueVigenteHoy(c.vencimiento)) continue;
  const cli: ClienteCiclo = {
    id: c.id,
    plan: c.plan,
    ilimitadoHasta: c.ilimitado_hasta,
    fechaContratacion: c.fecha_contratacion,
    vencimiento: c.vencimiento,
  };
  // OJO: el plan legacy no tiene tope (pasesIncluidos devuelve null), pero NO
  // se saltea. Su ancla igual importa: en cuanto renueva migra al X5 y hereda
  // la deducción que tenga guardada. Saltearlos fue lo que dejó 386 filas
  // fuera del backfill del 1-sep-2026.
  const incluidos = pasesIncluidos(planVigente(cli));

  const pasadas = (ingresosPorCliente.get(c.id) ?? []).map((i) => new Date(i.fecha));
  const usadosEn = ({ inicio, fin }: { inicio: Date; fin: Date }) => pasadas.filter((f) => f >= inicio && f < fin).length;

  const ventana = periodoPlan(cli);
  const usados = usadosEn(ventana);
  if (incluidos !== null && usados >= incluidos) {
    bloqueados.push({ patente: c.patente, usados, ventana: `${ymd(ventana.inicio)}→${ymd(ventana.fin)}`, sinAncla: !c.fecha_contratacion });
  }
  if (c.fecha_contratacion) continue;

  // Ancla real: la venta de plan cuyo ciclo termina exactamente en el
  // vencimiento guardado. Si ninguna calza —vencimiento editado a mano, carga
  // histórica— se congela la que hoy se deduce: no cambia ninguna ventana,
  // pero deja de depender de una deducción ambigua.
  const vencDia = diaEnSantiago(c.vencimiento);
  const reconstruida = (ventasPorCliente.get(c.id) ?? [])
    .filter((v) => TIPOS_VENTA_PLAN.has(v.tipo))
    .map((v) => new Date(v.fecha))
    .sort((a, b) => b.getTime() - a.getTime())
    .find((f) => vencDia && ymd(finCicloPlan(f)) === ymd(vencDia));
  const ancla = reconstruida ?? anclaCicloPlan(cli);
  if (!ancla) continue;

  const ventanaReal = periodoPlan({ ...cli, fechaContratacion: ancla.toISOString() });
  const pasesAhora = incluidos === null ? null : Math.max(0, incluidos - usados);
  const pasesDespues = incluidos === null ? null : Math.max(0, incluidos - usadosEn(ventanaReal));
  sinAncla.push({
    patente: c.patente,
    plan: planVigente(cli),
    origen: reconstruida ? "venta" : "deducida",
    // Sin ambigüedad no hay nada que reconstruir: si el vencimiento NO cae el
    // último día de su mes, `vencimiento + 1 día` es exactamente el inicio del
    // ciclo y la deducción no puede fallar. La ambigüedad es solo de fin de
    // mes, donde ese mismo vencimiento sale igual de un ancla 29/30/31
    // recortada que de una el 1 del mes siguiente.
    ambiguo: esUltimoDiaDelMes(c.vencimiento),
    ancla: ymd(ancla),
    mueveVentana: ymd(ventanaReal.inicio) !== ymd(ventana.inicio) ? `${ymd(ventana.inicio)} → ${ymd(ventanaReal.inicio)}` : "",
    pasesAhora,
    pasesDespues,
    backfill: ancla.toISOString(),
  });
}

console.log(`\n== Sin pases hoy (${bloqueados.length}) ==`);
console.table(bloqueados);

const ambiguas = sinAncla.filter((x) => x.ambiguo);
const mueven = sinAncla.filter((x) => x.mueveVentana);
const quitan = sinAncla.filter((x) => x.pasesDespues !== null && (x.pasesDespues as number) < (x.pasesAhora as number));
console.log(`\n== Con plan vigente y ancla sin guardar: ${sinAncla.length} ==`);
console.log(`   ambiguas (vencimiento a fin de mes, unico caso que puede fallar): ${ambiguas.length}`);
console.log(`   con la ventana ya corrida: ${mueven.length}  ·  a las que corregir les quita pasadas: ${quitan.length}`);
// Solo se listan las que importan: el resto tiene el vencimiento a mitad de
// mes, donde `vencimiento + 1 dia` es exacto y guardarlo es puro tramite.
console.table([...new Set([...ambiguas, ...mueven])]);

if (sinAncla.length) {
  // Ojo con las que aparecen en `quitan`: corregirles el ancla le saca una
  // pasada a alguien que ya pagó. Suele convenir dejarlas —la ventana se
  // realinea sola en la próxima renovación anclada— salvo que el cliente esté
  // bloqueado hoy, que es lo que muestra la primera tabla.
  console.log("\n-- backfill: pegar en el SQL Editor de Supabase (q.mts es solo-lectura) --");
  for (const m of sinAncla) {
    const aviso = (m.pasesDespues as number) < (m.pasesAhora as number) ? `  -- OJO: le quita ${(m.pasesAhora as number) - (m.pasesDespues as number)} pasada(s)` : "";
    console.log(`update clientes set fecha_contratacion = '${m.backfill}' where patente = '${m.patente}';${aviso}`);
  }
}
await sql.end();
