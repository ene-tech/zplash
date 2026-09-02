// Crea la ReglaCorreo que le manda comprobante a las RENOVACIONES.
//
// Por que hace falta: la regla "Confirmacion de compra" filtra por
// condicionTipoVenta = "Plan nuevo (Web)" (match exacto, ver coincideVenta en
// @/lib/mailing/reglas/disparadores), un tipo que en 30 dias ocurrio 10 veces.
// Las renovaciones —145 en el mismo periodo— no matchean ninguna regla y salen
// mudas. Al apagar los correos de WooCommerce eso deja al cliente sin ningun
// aviso de un cobro real, asi que esta regla es la que los cubre.
//
// Reusa la plantilla "Confirmación de Compra" tal cual: su texto ya sirve para
// una renovacion ("Confirmamos tu compra: {{plan}} ... Vigente hasta
// {{fechaVencimiento}}"), no dice nada de bienvenida.
//
// Idempotente: si ya existe una regla activa de venta_creada para este tipo de
// venta, no crea otra (mandaria el correo dos veces).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-crear-regla-renovacion.mts [--aplicar]
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");
const TIPO_VENTA = "Renovación (Web)";
const PLANTILLA = "c1786708263619892"; // "Confirmación de Compra"
const NOMBRE = "Confirmación de renovación";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const [plantilla] = await sql`select id, nombre, asunto from plantillas_correo where id = ${PLANTILLA}`;
  if (!plantilla) throw new Error(`No existe la plantilla ${PLANTILLA}`);

  const yaHay = await sql`
    select id, nombre, activa from reglas_correo
    where tipo_evento = 'venta_creada' and condicion_tipo_venta = ${TIPO_VENTA}`;
  const cuantas = await sql`
    select count(*)::int n from ventas
    where tipo = ${TIPO_VENTA} and fecha > now() - interval '30 days'`;

  console.log(`Plantilla:  ${plantilla.nombre} — "${plantilla.asunto}"`);
  console.log(`Tipo venta: ${TIPO_VENTA}  (${cuantas[0].n} ventas en los ultimos 30 dias)`);
  if (yaHay.length) {
    console.log(`\nYA EXISTE una regla para este tipo: ${yaHay.map((r: any) => `${r.nombre} (activa=${r.activa})`).join(", ")}`);
    console.log("No se crea nada, para no mandar el correo dos veces.");
    process.exit(0);
  }
  console.log(`\nA crear: "${NOMBRE}" | evento=venta_creada | tipo="${TIPO_VENTA}" | activa=true | delay=0`);

  if (!APLICAR) {
    console.log("\n(dry-run: no se escribio nada. Correr con --aplicar para crearla.)");
    process.exit(0);
  }

  const id = "c" + Date.now() + Math.floor(Math.random() * 1000);
  await sql`
    insert into reglas_correo
      (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_planes,
       condicion_dias_antes_vencimiento, condicion_solo_sin_autopago,
       condicion_solo_con_promo_renovacion, condicion_dias_despues_vencimiento,
       condicion_pasadas_max, delay_dias, plantilla_correo_id, creado_en, creado_por)
    values
      (${id}, ${NOMBRE}, true, 'venta_creada', ${TIPO_VENTA}, null,
       null, false, false, null, null, 0, ${PLANTILLA}, now(), 'script tmp-crear-regla-renovacion')`;

  const [creada] = await sql`
    select id, nombre, activa, tipo_evento, condicion_tipo_venta, delay_dias, plantilla_correo_id
    from reglas_correo where id = ${id}`;
  console.log("\nCREADA:", JSON.stringify(creada, null, 2));
} finally {
  await sql.end();
}
