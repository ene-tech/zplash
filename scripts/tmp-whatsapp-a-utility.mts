// Baja de MARKETING a UTILITY los templates de WhatsApp que son avisos de
// cuenta y no promociones. La conversacion UTILITY cuesta menos y no la
// bloquean los opt-out de marketing.
//
// La categoria de un template APROBADO no se puede editar (error 3835031,
// probado el 2026-09-03): hay que apuntar a otro template. Por suerte para dos
// de ellos YA existe el gemelo UTILITY aprobado en el WABA, con el mismo numero
// de variables en el mismo orden, asi que basta cambiar `meta_nombre` en
// nuestra base — cero ida y vuelta con Meta, efecto inmediato.
//
//   confirmacion_compre_nuevo_plan (MKT) -> confirmacion_compra_plan (UTIL)
//   confirmacion_compra_lavado_unico (MKT) -> confirmacion_lavado_unico (UTIL)
//
// Tambien se actualiza el `mensaje` guardado, que es el que se ve en el preview
// de Web Settings: el de lavado unico decia otra cosa completamente (vendia el
// "Plan Ilimitado a solo $11.990", un plan que ya no existe) y por eso Meta lo
// tenia bien clasificado como MARKETING.
//
// NO se tocan, estan bien como MARKETING porque ofrecen algo:
//   entrega_codigo_cupon, rellamado_con_descuento_clientes_sin_plan,
//   mensaje_cliente_plan_review_google
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-whatsapp-a-utility.mts [--aplicar]
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");

const CAMBIOS = [
  {
    de: "confirmacion_compre_nuevo_plan",
    a: "confirmacion_compra_plan",
    variables: ["nombre", "plan", "patente", "fechavencimiento"],
    mensaje:
      "¡Hola {{nombre}}👋! Confirmamos la compra de tu {{plan}} para tu 🚗 {{patente}}.\n\n" +
      "Tu plan queda vigente hasta el {{fechaVencimiento}}.\n\n" +
      "En Mi Cuenta puedes ver el detalle.",
  },
  {
    de: "confirmacion_compra_lavado_unico",
    a: "confirmacion_lavado_unico",
    variables: ["nombre", "patente"],
    mensaje: "Hola {{nombre}} 👋 Confirmamos tu lavado en ZPlash para tu 🚘 {{patente}}.\n\nGracias por venir.",
  },
];

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  console.log(`${APLICAR ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
  for (const c of CAMBIOS) {
    const [fila] = await sql`
      select id, nombre, meta_nombre, meta_variables from plantillas_whatsapp where meta_nombre = ${c.de}`;
    if (!fila) {
      console.log(`  ${c.de} -> no hay ninguna plantilla apuntando ahi, nada que hacer`);
      continue;
    }
    console.log(`  "${fila.nombre}"`);
    console.log(`     ${c.de}  (MARKETING)`);
    console.log(`  -> ${c.a}  (UTILITY)`);
    console.log(`     variables: ${JSON.stringify(fila.meta_variables)} -> ${JSON.stringify(c.variables)}`);
    if (APLICAR) {
      await sql`
        update plantillas_whatsapp
        set meta_nombre = ${c.a}, meta_variables = ${sql.json(c.variables)},
            mensaje = ${c.mensaje}, meta_idioma = 'es_CL', meta_aprobado = true
        where id = ${fila.id}`;
      console.log(`     LISTO (${fila.id})`);
    }
    console.log();
  }

  if (!APLICAR) {
    console.log("(dry-run: no se escribio nada. Correr con --aplicar.)");
  } else {
    console.log("--- plantillas de WhatsApp ahora ---");
    for (const x of (await sql`
      select nombre, meta_nombre, meta_aprobado from plantillas_whatsapp
      where meta_nombre is not null order by meta_nombre`) as any[])
      console.log(`  ${String(x.meta_nombre).padEnd(44)} aprobado=${x.meta_aprobado}  (${String(x.nombre).slice(0, 40)})`);
  }
} finally {
  await sql.end();
}
