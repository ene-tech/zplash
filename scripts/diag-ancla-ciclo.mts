// Diagnóstico del ancla del ciclo de pases (ver cicloPlanDesde / anclaCicloPlan
// en @/lib/helpers/clientes). SOLO LECTURA.
//
// Un cliente con Plan X5 y `fecha_contratacion` en null obliga a periodoPlan a
// DEDUCIR el borde del ciclo del vencimiento (`vencimiento + 1 día`). Esa
// deducción no es inversa de finCicloPlan cuando el día quedó recortado
// (anclas 29/30/31 sobre un mes más corto): ahí la ventana de pases queda
// corrida y el mesón puede negarle el ingreso a un cliente que pagó — caso
// HYRL56, 31-ago-2026.
//
// Para cada fila sin fecha_contratacion se reconstruye el ancla real buscando
// la venta de plan cuyo finCicloPlan(fecha) da exactamente el vencimiento
// guardado, y se compara la ventana que sale de ahí contra la deducida.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-ancla-ciclo.mts
import postgres from "postgres";
import { finCicloPlan, periodoPlan, sigueVigenteHoy } from "@/lib/helpers/clientes";
import { diaEnSantiago } from "@/lib/helpers/fechas";
import { pasesIncluidos, planVigente } from "@/lib/helpers/precios";
import { TIPOS_VENTA_PLAN } from "@/lib/helpers/ventas";
import type { Cliente } from "@/types";

type ClienteCiclo = Pick<Cliente, "id" | "plan" | "ilimitadoHasta" | "fechaContratacion" | "vencimiento">;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const clientes = await sql`
  select id, nombre, patente, plan, vencimiento, fecha_contratacion, ilimitado_hasta
  from clientes where plan is not null and vencimiento is not null`;
const ingresos = await sql<{ cliente_id: string | null; fecha: string }[]>`
  select cliente_id, fecha from ingresos where fecha > now() - interval '200 days'`;
const ventas = await sql<{ cliente_id: string | null; fecha: string; tipo: string }[]>`
  select cliente_id, fecha, tipo from ventas where fecha > now() - interval '200 days'`;

const porCliente = <T extends { cliente_id: string | null }>(filas: T[]) => {
  const m = new Map<string, T[]>();
  for (const f of filas) if (f.cliente_id) m.set(f.cliente_id, [...(m.get(f.cliente_id) ?? []), f]);
  return m;
};
const ingresosPorCliente = porCliente(ingresos);
const ventasPorCliente = porCliente(ventas);

const bloqueados: Record<string, unknown>[] = [];
const malAncladas: Record<string, unknown>[] = [];

for (const c of clientes) {
  if (!sigueVigenteHoy(c.vencimiento)) continue;
  const cli: ClienteCiclo = {
    id: c.id,
    plan: c.plan,
    ilimitadoHasta: c.ilimitado_hasta,
    fechaContratacion: c.fecha_contratacion,
    vencimiento: c.vencimiento,
  };
  const incluidos = pasesIncluidos(planVigente(cli));
  if (incluidos === null) continue;

  const pasadas = (ingresosPorCliente.get(c.id) ?? []).map((i) => new Date(i.fecha));
  const usadosEn = ({ inicio, fin }: { inicio: Date; fin: Date }) => pasadas.filter((f) => f >= inicio && f < fin).length;

  const ventana = periodoPlan(cli);
  const usados = usadosEn(ventana);
  if (usados >= incluidos) {
    bloqueados.push({ patente: c.patente, usados, ventana: `${ymd(ventana.inicio)}→${ymd(ventana.fin)}`, sinAncla: !c.fecha_contratacion });
  }
  if (c.fecha_contratacion) continue;

  // Ancla real: la venta de plan cuyo ciclo termina exactamente en el
  // vencimiento guardado. Si ninguna calza, el vencimiento no salió de una
  // venta (edición a mano, carga histórica) y no hay nada que reconstruir.
  const vencDia = diaEnSantiago(c.vencimiento);
  const real = (ventasPorCliente.get(c.id) ?? [])
    .filter((v) => TIPOS_VENTA_PLAN.has(v.tipo))
    .map((v) => new Date(v.fecha))
    .sort((a, b) => b.getTime() - a.getTime())
    .find((f) => vencDia && ymd(finCicloPlan(f)) === ymd(vencDia));
  if (!real) continue;

  const ventanaReal = periodoPlan({ ...cli, fechaContratacion: real.toISOString() });
  if (ymd(ventanaReal.inicio) === ymd(ventana.inicio)) continue;
  malAncladas.push({
    patente: c.patente,
    contratacionReal: ymd(real),
    ventanaDeducida: `${ymd(ventana.inicio)}→${ymd(ventana.fin)}`,
    ventanaReal: `${ymd(ventanaReal.inicio)}→${ymd(ventanaReal.fin)}`,
    pasesDeducidos: Math.max(0, incluidos - usados),
    pasesReales: Math.max(0, incluidos - usadosEn(ventanaReal)),
    backfill: real.toISOString(),
  });
}

console.log(`\n== Sin pases hoy (${bloqueados.length}) ==`);
console.table(bloqueados);
console.log(`\n== Ancla deducida distinta de la real (${malAncladas.length}) ==`);
console.table(malAncladas);
if (malAncladas.length) {
  console.log("\n-- backfill --");
  for (const m of malAncladas) console.log(`update clientes set fecha_contratacion = '${m.backfill}' where patente = '${m.patente}';`);
}
await sql.end();
