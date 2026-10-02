// Los dos templates de WhatsApp del programa de referidos (ver @/lib/referidos):
//
// 1. "lavado_unico_referidos": sale tras un lavado único de $9.990 invitando a
//    referir. Reemplaza en la regla del lavado único a
//    `lavado_unico_upgrade_plan` (ver crear-template-upgrade-lavado-unico.mts,
//    la plantilla vieja queda en la base para volver a ella). Está escrito para
//    REENVIARSE tal cual: la primera parte le habla al cliente, la segunda al
//    amigo que lo recibe reenviado. El link lleva la patente del cliente.
//    Variables: {{1}} nombre, {{2}} y {{3}} descuentoReferido (cada {{n}} se usa
//    una sola vez, como en el upgrade), {{4}} patente para el link.
//
// 2. "premio_referido": el aviso a quien invitó cuando el amigo usó su cupón
//    (lo manda el cron /api/referidos/premiar; sin este template el aviso sale
//    solo por correo). Variables: {{1}} nombre, {{2}} descuentoReferido,
//    {{3}} patente, {{4}} fechaVencimientoOferta.
//
// Ninguno termina en una variable (Meta lo rechaza) y los dos van en MARKETING:
// regalan un descuento (ver crear-template-entrega-cupon.mts).
//
// Uso, en dos pasos:
//   1. npx tsx --env-file=.env.local scripts/crear-template-referidos-lavado-unico.mts
//      Los manda a revisión de Meta (si ya existen, les reemplaza el texto).
//   2. npx tsx --env-file=.env.local scripts/crear-template-referidos-lavado-unico.mts --activar
//      Cuando el código de referidos ya esté DESPLEGADO. Activa cada template
//      que Meta ya tenga APPROVED (crea su plantilla en la base) y deja
//      pendiente el que no; se puede correr de nuevo más tarde.
//
// Al activar la invitación también se apaga condicion_excluir_con_cupon de la
// regla: ese filtro era para no ofrecer el upgrade a quien pagó con cupón, pero
// el amigo referido paga su primer lavado justo con un cupón y tiene que recibir
// la invitación para seguir la cadena.
import postgres from "postgres";

const REGLA_ID = "c1785023347517636";

const TEMPLATES = [
  {
    nombre: "lavado_unico_referidos",
    plantillaId: "wa-lavado-unico-referidos",
    titulo: "Lavado único $9.990 + regala y gana (referidos)",
    texto:
      "Hola {{1}} 👋 ¡Gracias por lavar tu auto en ZPlash!\n\n🎁 Regala {{2}} y gana {{3}}: reenvía este mensaje a un amigo. Él recibe el descuento en su primer lavado y, cuando lo use, te dejamos el tuyo para tu próximo pago.\n\n👇 Si te reenviaron este mensaje, activa tu descuento dejando tu patente aquí:\nhttps://zplash.cl/?ref={{4}}\n\n¡Nos vemos en el túnel! 🚿",
    variables: ["nombre", "descuentoReferido", "descuentoReferido", "patente"],
    ejemplo: ["Juan", "$2.000", "$2.000", "SZGH65"],
    esDeLaRegla: true,
  },
  {
    nombre: "premio_referido",
    // Mismo id que PLANTILLA_WHATSAPP_PREMIO_REFERIDO en src/lib/referidos.ts.
    plantillaId: "wa-premio-referido",
    titulo: "Premio de referido (tu amigo usó tu descuento)",
    texto:
      "¡Hola {{1}}! 🎉 Tu amigo ya usó el descuento que le regalaste, así que te ganaste {{2}} para tu próxima compra en ZPlash.\n\nQuedó guardado en tu patente {{3}} y se aplica solo al pagar, en el local o por la web. Vale hasta el {{4}}.\n\n¿Tienes más amigos con auto? Sigue invitando y sigue ganando 🚿",
    variables: ["nombre", "descuentoReferido", "patente", "fechaVencimientoOferta"],
    ejemplo: ["Juan", "$2.000", "SZGH65", "01-11-2026"],
    esDeLaRegla: false,
  },
];

const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}
const api = `https://graph.facebook.com/v25.0/${waba}/message_templates`;

const buscar = (nombre: string) =>
  fetch(`${api}?name=${nombre}&fields=id,name,status,category`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .then((d) => d.data?.find((x: { name: string }) => x.name === nombre));

if (!process.argv.includes("--activar")) {
  let fallo = false;
  for (const t of TEMPLATES) {
    const existente = await buscar(t.nombre);
    const components = [{ type: "BODY", text: t.texto, example: { body_text: [t.ejemplo] } }];
    const res = await fetch(existente ? `https://graph.facebook.com/v25.0/${existente.id}` : api, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(existente ? { components } : { name: t.nombre, language: "es_CL", category: "MARKETING", components }),
    });
    const data = await res.json();
    if (data.error) {
      console.error(`Meta rechazó ${t.nombre}:`, JSON.stringify(data.error, null, 2));
      fallo = true;
    } else {
      console.log(`${t.nombre}: enviado a revisión`, data);
    }
  }
  process.exit(fallo ? 1 : 0);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  for (const t of TEMPLATES) {
    const meta = await buscar(t.nombre);
    if (meta?.status !== "APPROVED") {
      console.log(`${t.nombre}: todavía no aprobado (${meta ? `${meta.status} ${meta.category}` : "no existe"}), no se tocó.`);
      continue;
    }
    let mensaje = t.texto;
    t.variables.forEach((v, i) => (mensaje = mensaje.replace(`{{${i + 1}}}`, `{{${v}}}`)));
    await sql`
      insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo, meta_nombre, meta_idioma, meta_variables, meta_aprobado)
      values (${t.plantillaId}, ${t.titulo}, 'Proceso de venta', ${mensaje}, true, ${t.nombre}, 'es_CL',
        ${sql.json(t.variables.map((v) => v.toLowerCase()))}, true)
      on conflict (id) do update set meta_aprobado = true`;
    if (t.esDeLaRegla) {
      await sql`update reglas_whatsapp set plantilla_whatsapp_id = ${t.plantillaId}, condicion_excluir_con_cupon = false where id = ${REGLA_ID}`;
      console.log(`${t.nombre}: activo, la regla ${REGLA_ID} ahora lo manda.`);
    } else {
      console.log(`${t.nombre}: activo, el cron de premios ya avisa por WhatsApp.`);
    }
  }
} finally {
  await sql.end();
}
