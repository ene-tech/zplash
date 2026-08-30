// One-off: prueba del correo de la campaña "$4.000 en tu cuenta" (ago-2026),
// descuento por suscribirse en la web", renderizado con los datos REALES de un
// cliente LOCAL vencido que tenga cupón, para ver {{montoDescuento}} y
// {{montoAPagar}} con números de verdad antes de mandarle esto a nadie.
//
// No escribe disparos_regla_correo ni toca al cliente elegido: lo único que
// queda en base es la copia que deja enviarCorreoTransaccional en
// correos_automaticos, sin clienteId, así no cuelga de la ficha de nadie.
//
// Uso (--conditions=react-server o `server-only` tira "cannot be imported from
// a Client Component" al cargar dataAccess):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/tmp-prueba-correo-vencidos-local.mts tu@correo.cl
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
// Desde los módulos hoja y no desde el barrel "@/lib/helpers": importarlo acá
// entra en ciclo con dataAccess (que ya lo está instanciando) y Node corta con
// "does not provide an export named".
import { montoDescuento } from "@/lib/helpers/cupones";
import { fmtCLP } from "@/lib/helpers/precios";
import { aplicarVariables } from "@/lib/helpers/whatsapp";
import { ofertaConCupon } from "@/lib/helpers/ofertasPlan";
import { buscarCuponDescuentoPlan } from "@/lib/pagos/cuponPlan";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { construirVariables } from "@/lib/whatsapp/reglas/motor";

// Por argumento y no fijo en el archivo: esto se commitea y la dirección de
// prueba es personal.
const DESTINO = process.argv[2];
if (!DESTINO) {
  console.log("Falta la dirección de prueba: ... scripts/tmp-prueba-correo-vencidos-local.mts tu@correo.cl");
  process.exit(1);
}

const ASUNTO = "{{montoDescuento}} de descuento en tu cuenta, reactívalo";

const CUERPO = `Hola {{nombre}},

Tu plan para la patente {{patente}} venció el {{fechaVencimiento}}, te dejamos **{{montoDescuento}} de descuento** cargados en tu cuenta.

Contrata por solo **{{precioReactivacion}}** No tienes que ingresar ningún código ni pedirlo en el local: entra a Mi Cuenta con tu patente {{patente}} y el precio ya sale rebajado.

Son 5 pasadas por el túnel al mes, sin filas y sin tocar el auto.

El descuento vence el **10 de septiembre**.

Nos vemos en el túnel,`;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });
// Candidatos: LOCAL, vencido (mismo criterio día-granular en hora de Chile que
// planStatus) y con cupón de descuento vivo para su patente. Se traen varios
// porque tener cupón no garantiza tramo de reactivación, y sin tramo el correo
// sale mudo (ver el filtro de scripts/tmp-reenvio61.mts).
const ids = (
  await sql`
    select cl.id
    from clientes cl
    where cl.plan is not null and btrim(cl.plan) <> ''
      and cl.vencimiento is not null
      and (cl.vencimiento at time zone 'America/Santiago')::date < (now() at time zone 'America/Santiago')::date
      and exists (
        select 1 from cupones c
        where c.patente_asignada = cl.patente and c.tipo = 'descuento'
          and c.usado = false and c.fecha_caducidad > now())
    order by cl.vencimiento desc
    limit 25`
).map((r) => r.id as string);
await sql.end();

const clientes = await getClientesByIds(ids);
console.log("candidatos vencidos con cupón:", clientes.length);

// Mismo cálculo que hace ahora enviarCorreosMasivos (@/lib/mailing/masivo).
let elegido:
  | { cliente: (typeof clientes)[number]; variables: Record<string, string>; base: number; descuento: number }
  | undefined;
for (const cliente of clientes) {
  const sinCupon = await calcularOfertasPlanDeCliente(cliente);
  if (!sinCupon.reactivacion) continue; // sin tramo: el descuento no se aplica en la web
  const cupon = await buscarCuponDescuentoPlan(cliente.patente);
  if (!cupon) continue;
  const reactivacion = ofertaConCupon(sinCupon, cupon).reactivacion;
  const descuento = montoDescuento(cupon, sinCupon.reactivacion.precio);
  elegido = {
    cliente,
    base: sinCupon.reactivacion.precio,
    descuento,
    variables: construirVariables({
      cliente,
      precioReactivacion: reactivacion?.precio,
      pasadas: reactivacion?.visitas,
      montoDescuento: descuento,
      montoAPagar: reactivacion?.precio,
    }),
  };
  break;
}

if (!elegido) {
  console.log("RESULTADO: ningún candidato con tramo de reactivación + cupón; no se manda nada");
  process.exit(1);
}

console.log("cliente de muestra:", elegido.cliente.patente, "|", elegido.cliente.plan);
console.log("precio sin cupón:", fmtCLP(elegido.base), "| descuento:", fmtCLP(elegido.descuento), "| a pagar:", elegido.variables.montoAPagar);

const resultado = await enviarCorreoTransaccional({
  to: DESTINO,
  subject: `[PRUEBA] ${aplicarVariables(ASUNTO, elegido.variables)}`,
  html: envolverCorreoBase(CUERPO, elegido.variables),
});
console.log("RESULTADO:", JSON.stringify(resultado));
process.exit(resultado.ok ? 0 : 1);
