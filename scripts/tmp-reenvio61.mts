// Reenvío a los que quedaron fuera de la tanda del 28-ago por no tener tramo
// de reactivación. Recalcula con la config vigente: quien siga sin precio se
// vuelve a excluir (el correo saldría mudo).
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { ofertaConCupon } from "@/lib/helpers/ofertasPlan";
import { buscarCuponDescuentoPlan } from "@/lib/pagos/cuponPlan";
import { enviarCorreosMasivos } from "@/lib/mailing/masivo";

const REGLA = "envio-manual-c1787868766779622";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 8 });
// Los del envío original que NO entraron en el reenvío del 28-ago.
const ids = (await sql`
  select distinct d.cliente_id
  from disparos_regla_correo d
  where d.regla_id = ${REGLA} and d.estado = 'enviado' and d.cliente_id is not null
    and d.origen_id not like '%reenvio-2026-08-28'
    and not exists (
      select 1 from disparos_regla_correo r
      where r.regla_id = ${REGLA} and r.cliente_id = d.cliente_id
        and r.origen_id like '%reenvio-2026-08-28')`).map((r) => r.cliente_id as string);
await sql.end();

const clientes = await getClientesByIds(ids);
const enviables: string[] = [];
const precios = new Map<number, number>();
const sinPrecio: string[] = [];
const vigentes: string[] = [];
for (const c of clientes) {
  const o = ofertaConCupon(await calcularOfertasPlanDeCliente(c), await buscarCuponDescuentoPlan(c.patente)).reactivacion;
  if (!o?.precio) {
    // Sin oferta de reactivación: o sigue fuera de todo tramo, o ya renovó (y
    // entonces no hay que escribirle "reactiva tu plan").
    (c.vencimiento && new Date(c.vencimiento) > new Date() ? vigentes : sinPrecio).push(c.patente);
    continue;
  }
  enviables.push(c.id);
  precios.set(o.precio, (precios.get(o.precio) ?? 0) + 1);
}
console.log("candidatos:", clientes.length);
console.log("PRECIO FINAL:", [...precios].sort((a, b) => a[0] - b[0]).map(([k, v]) => `$${k.toLocaleString("es-CL")}: ${v}`).join(" | ") || "(ninguno)");
console.log("enviables:", enviables.length, "| ya con plan vigente:", vigentes.length, vigentes.join(","), "| siguen sin precio:", sinPrecio.length, sinPrecio.join(","));

if (!enviables.length) { console.log("RESULTADO: nada que enviar"); process.exit(0); }
if ([...precios.keys()].some((p) => p <= 0)) { console.log("ABORTADO: hay precios en $0"); process.exit(1); }

const r = await enviarCorreosMasivos({
  plantillaCorreoId: "c1787868766779622",
  clienteIds: enviables,
  enviadoPor: "reenvio-fix-precio",
  reintento: "reenvio-2026-08-28b",
});
console.log("RESULTADO:", JSON.stringify(r));
process.exit(0);
