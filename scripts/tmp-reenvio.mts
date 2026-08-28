// Reenvío de la campaña "Activa tu plan" con el precio ya corregido (valor del
// plan menos el descuento de la cuenta, mismo número en asunto y cuerpo).
// Excluye a quien no tiene tramo de reactivación vigente: sin precio el correo
// vuelve a salir mudo, mismo criterio que el `obligatorio` del cron.
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { ofertaConCupon } from "@/lib/helpers/ofertasPlan";
import { buscarCuponDescuentoPlan } from "@/lib/pagos/cuponPlan";
import { enviarCorreosMasivos } from "@/lib/mailing/masivo";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 8 });
const ids = (await sql`select distinct cliente_id from disparos_regla_correo where regla_id = 'envio-manual-c1787868766779622' and estado = 'enviado' and cliente_id is not null`).map((r) => r.cliente_id as string);
await sql.end();

const clientes = await getClientesByIds(ids);
const enviables: string[] = [];
const precios = new Map<number, number>();
const sinPrecio: string[] = [];
for (const c of clientes) {
  const o = ofertaConCupon(await calcularOfertasPlanDeCliente(c), await buscarCuponDescuentoPlan(c.patente)).reactivacion;
  if (!o?.precio) { sinPrecio.push(c.patente); continue; }
  enviables.push(c.id);
  precios.set(o.precio, (precios.get(o.precio) ?? 0) + 1);
}
console.log("PRECIO FINAL:", [...precios].sort((a, b) => a[0] - b[0]).map(([k, v]) => `$${k.toLocaleString("es-CL")}: ${v}`).join(" | "));
console.log(`destinatarios originales: ${clientes.length} | enviables: ${enviables.length} | excluidos sin precio: ${sinPrecio.length}`);
console.log("excluidos:", sinPrecio.join(", "));

const r = await enviarCorreosMasivos({
  plantillaCorreoId: "c1787868766779622",
  clienteIds: enviables,
  enviadoPor: "reenvio-fix-precio",
  reintento: "reenvio-2026-08-28",
});
console.log("RESULTADO:", JSON.stringify(r));
process.exit(0);
