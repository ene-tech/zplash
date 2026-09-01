// Reactivaciones web/Oneclick a las que se les anclo el ciclo VIEJO en vez de
// arrancarles uno nuevo desde el pago. SOLO LECTURA: imprime el SQL, no aplica.
//
// Una "Reactivacion promocional" se vende como un mes completo desde hoy: el
// cliente esta vencido hace rato y lo que compra es un ciclo nuevo, no lo que
// quedaba del viejo. En el meson eso siempre funciono (renovarPlan arranca de
// finCicloPlan(hoy) cuando el plan no esta vigente), pero por web y por
// Oneclick el pago pasaba por aplicarPagoAprobado, que sin la bandera
// `reiniciarCiclo` caia en vencimientoAnclado() y le apilaba un mes sobre el
// vencimiento ya vencido. Resultado: el cliente paga un mes y recibe lo que
// sobraba del ciclo anterior — tantos dias menos como llevara vencido.
//
// `reiniciarCiclo` entro en el commit 7976468 (31-ago-2026), asi que afecta a
// toda reactivacion web/Oneclick anterior a esa fecha.
//
// Caso testigo: RYZX65 (RICHARD CARU), pago el 17-ago-2026, vencimiento viejo
// 2-ago -> le quedo 1-sep (= 2-ago + 30d) en vez de 16-sep. 15 dias menos.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-reactivaciones-cortas.mts
import postgres from "postgres";
import { finCicloPlan } from "@/lib/helpers/clientes";
import { diaEnSantiago } from "@/lib/helpers/fechas";

const FIX = "2026-08-31"; // commit 7976468: reiniciarCiclo
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DIA = 24 * 3600 * 1000;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

// Solo web y Oneclick: las del meson ("Reactivacion promocional" a secas) ya
// pasaban por renovarPlan, que si reinicia el ciclo.
const filas = await sql<
  { patente: string; patente_actual: string; cliente_id: string; fecha: string; tipo: string; precio: number; vencimiento: string; posteriores: number }[]
>`
  select v.patente, c.patente as patente_actual, v.cliente_id, v.fecha, v.tipo, v.precio, c.vencimiento,
         (select count(*) from ventas v2
           where v2.cliente_id = v.cliente_id and v2.plan <> '' and v2.fecha > v.fecha) as posteriores
    from ventas v join clientes c on c.id = v.cliente_id
   where v.tipo in ('Reactivación promocional (Web)', 'Reactivación promocional (Oneclick)')
     and v.fecha < ${FIX}
   order by v.fecha`;

const cortas: Record<string, unknown>[] = [];
for (const f of filas) {
  // Lo que le correspondia: un mes completo contado desde el pago.
  const pago = diaEnSantiago(f.fecha);
  const actual = diaEnSantiago(f.vencimiento);
  if (!pago || !actual) continue;
  const correcto = finCicloPlan(pago);
  const diasFaltantes = Math.round((correcto.getTime() - actual.getTime()) / DIA);
  if (diasFaltantes <= 0) continue;
  cortas.push({
    // La patente de la VENTA es la que tenía el auto cuando pagó; el cliente
    // pudo cambiarla después (ver patentePendiente). Se muestran las dos y el
    // UPDATE va por `id`, que no se mueve: apuntarlo a la patente vieja
    // actualiza CERO filas y no da error — falla en silencio.
    patenteEnVenta: f.patente,
    patente: f.patente_actual,
    clienteId: f.cliente_id,
    pago: ymd(pago),
    precio: Number(f.precio),
    vence: ymd(actual),
    deberiaVencer: ymd(correcto),
    diasFaltantes,
    // Con una venta de plan posterior el vencimiento ya se movio por otra via:
    // corregirlo a ciegas le apilaria dias de mas. Se listan aparte.
    renovoDespues: Number(f.posteriores) > 0,
    correctoISO: correcto.toISOString(),
  });
}

const limpias = cortas.filter((c) => !c.renovoDespues);
const conRenovacion = cortas.filter((c) => c.renovoDespues);

console.log(`\n== Reactivaciones web/Oneclick previas a ${FIX}: ${filas.length} ==`);
console.log(`   cortas: ${cortas.length}  ·  sin renovacion posterior (corregibles directo): ${limpias.length}`);
console.log(`   dias no entregados en total: ${cortas.reduce((a, c) => a + (c.diasFaltantes as number), 0)}`);
console.table(limpias);
if (conRenovacion.length) {
  console.log("\n== Cortas pero con venta de plan posterior: revisar a mano, NO corregir a ciegas ==");
  console.table(conRenovacion);
}

if (limpias.length) {
  console.log("\n-- pegar en el SQL Editor de Supabase (q.mts es solo-lectura) --");
  for (const c of limpias) {
    console.log(
      `update clientes set vencimiento = '${c.correctoISO}' where id = '${c.clienteId}';` +
        `  -- ${c.patente}${c.patente !== c.patenteEnVenta ? ` (pago como ${c.patenteEnVenta})` : ""}: ` +
        `${c.vence} -> ${c.deberiaVencer} (+${c.diasFaltantes}d)`
    );
  }
}
await sql.end();
