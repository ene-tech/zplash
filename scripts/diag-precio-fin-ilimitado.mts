// SOLO LECTURA: que numero le saldria a cada uno de los del aviso del fin del
// ilimitado si la plantilla usara {{precioRenovacion}}, y cuanto le costaria de
// verdad el Plan X5.
//
// {{precioRenovacion}} sale de calcularOfertasPlanDeCliente().renovacionAnticipada
// y solo tiene valor si al cliente le calza un tramo de renovacion anticipada
// por el canal Web con ahorro real; si no, queda VACIO y la frase del correo
// sale coja. Al que viene mucho tipicamente no le calza ningun tramo, y estos
// son justamente los que vienen mucho.
//
// Uso: npx tsx --conditions=react-server --env-file=.env.local \
//        scripts/diag-precio-fin-ilimitado.mts
import postgres from "postgres";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { periodoPlan } from "@/lib/helpers/clientes";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY, planVigente } from "@/lib/helpers/precios";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const { cl, ing } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return {
      cl: await tx.unsafe(`select * from clientes where vencimiento >= now() and vencimiento <= now() + interval '7 days'`),
      ing: await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '4 months'`),
    } as any;
  });
  const pasadasDe = new Map<string, Date[]>();
  for (const i of ing as any[]) if (i.cliente_id) pasadasDe.set(i.cliente_id, [...(pasadasDe.get(i.cliente_id) || []), new Date(i.fecha)]);

  const objetivo = (cl as any[]).filter((c) => {
    if (planVigente({ plan: c.plan ?? undefined, ilimitadoHasta: c.ilimitado_hasta ?? undefined }) !== PLAN_ILIMITADO_LEGACY) return false;
    const { inicio, fin } = periodoPlan({ fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento } as any);
    return (pasadasDe.get(c.id) || []).filter((f) => f >= inicio && f < fin).length > PASES_INCLUIDOS_X5;
  });

  let conNumero = 0;
  const upgrades: number[] = [];
  console.log(`Los ${objetivo.length} del aviso:\n`);
  for (const c of objetivo) {
    const cli = clienteFromRow(c);
    const o = await calcularOfertasPlanDeCliente(cli);
    const ren = o.renovacionAnticipada;
    const precioRenovacion = ren && ren.tramoVigente && ren.ahorro > 0 ? ren.pPromo : undefined;
    if (precioRenovacion !== undefined) conNumero++;
    const upg = o.upgrade?.precio;
    if (upg !== undefined) upgrades.push(upg);
    console.log(
      `  ${c.patente.padEnd(7)} heredado=${String(c.precio_plan_heredado ?? "-").padStart(6)}` +
        `  {{precioRenovacion}}=${precioRenovacion === undefined ? "VACIO " : String(precioRenovacion).padStart(6)}` +
        `  upgrade X5=${upg === undefined ? "-" : upg}`
    );
  }
  console.log(`\nCon numero en {{precioRenovacion}}: ${conNumero}/${objetivo.length}`);
  console.log(`Sin numero (saldria vacio en el correo): ${objetivo.length - conNumero}`);
} finally {
  await sql.end();
}
