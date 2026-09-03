// Registra en la base la plantilla de WhatsApp "fin_plan_ilimitado" (la que
// scripts/crear-template-fin-ilimitado.mts mando a aprobar a Meta) y crea la
// regla que la dispara 7 dias antes del vencimiento.
//
// Mismas tres condiciones que la regla de correo hermana, para que los dos
// canales le hablen exactamente a la misma gente:
//   - plan vigente = Plan Ilimitado Mensual (comparado contra planVigente, no
//     contra la columna `plan`)
//   - pasadas del ciclo en curso >= 6 (politica: al de 5 o menos se le mantiene)
//   - 7 dias antes de que se le venza
//
// Apunta a "fin_plan_ilimitado_aviso", que quedo APPROVED como UTILITY, y no al
// primer intento "fin_plan_ilimitado", que Meta aprobo pero reclasificando a
// MARKETING. La diferencia entre los dos textos es una frase: el primero decia
// "ver las alternativas", que el clasificador lee como invitacion a comprar.
// UTILITY cuesta menos y no lo bloquean los opt-out de promociones.
//
// La regla se crea APAGADA y la plantilla queda con metaAprobado = false hasta
// que se corra con --prender.
//
// REQUIERE la columna condicion_pasadas_min en reglas_whatsapp. Se aplica a
// mano en Supabase (las migraciones de drizzle estan desincronizadas):
//   alter table reglas_whatsapp add column if not exists condicion_pasadas_min integer;
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-regla-whatsapp-fin-ilimitado.mts [--aplicar|--prender]
import postgres from "postgres";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY } from "@/lib/helpers/precios";

const APLICAR = process.argv.includes("--aplicar");
const PRENDER = process.argv.includes("--prender");
const META_NOMBRE = "fin_plan_ilimitado_aviso";
const NOMBRE = "Fin del Plan Ilimitado";
const DIAS_ANTES = 7;
const PASADAS_MIN = PASES_INCLUIDOS_X5 + 1;

// Mismo texto que se mando a Meta, para que el preview de Web Settings muestre
// lo que de verdad le llega al cliente. Las {{variables}} de aca se mapean a
// las posicionales {{1}} {{2}} {{3}} por el orden de metaVariables.
const MENSAJE =
  "Hola {{nombre}} 👋 Te avisamos que el Plan Ilimitado Mensual de tu patente {{patente}} termina el {{fechaVencimiento}}.\n\n" +
  "Hasta esa fecha sigues lavando sin límite, como siempre.\n\n" +
  "En Mi Cuenta puedes revisar tu plan y administrar tu cobro automático.";
const META_VARIABLES = ["nombre", "patente", "fechavencimiento"];

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const col = await sql`
    select 1 from information_schema.columns
    where table_name = 'reglas_whatsapp' and column_name = 'condicion_pasadas_min'`;
  if (!col.length) {
    console.error("FALTA la columna condicion_pasadas_min en reglas_whatsapp.");
    console.error("Pegar esto en el SQL Editor de Supabase y volver a correr:\n");
    console.error("  alter table reglas_whatsapp add column if not exists condicion_pasadas_min integer;\n");
    process.exit(1);
  }

  const [plantilla] = await sql`select id, meta_aprobado from plantillas_whatsapp where meta_nombre = ${META_NOMBRE}`;
  const [regla] = await sql`select id, activa from reglas_whatsapp where nombre = ${NOMBRE}`;

  console.log(`${APLICAR || PRENDER ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
  console.log(`Plantilla "${META_NOMBRE}" -> ${plantilla ? `existe (${plantilla.id})` : "crear"}`);
  console.log(`Regla "${NOMBRE}"          -> ${regla ? `existe (${regla.id}, activa=${regla.activa})` : "crear APAGADA"}`);
  console.log(`   ${DIAS_ANTES} dias antes | plan vigente = ${PLAN_ILIMITADO_LEGACY} | pasadas del ciclo >= ${PASADAS_MIN}`);

  if (PRENDER) {
    console.log(`\nOJO: prender esto manda WhatsApp de verdad. El template tiene que estar APPROVED en Meta.`);
    console.log(`Verificar antes con: npx tsx --env-file=.env.local scripts/templates-meta.mts`);
  }

  if (!APLICAR && !PRENDER) {
    console.log(`\n(dry-run: no se escribio nada. Correr con --aplicar.)`);
  } else {
    let plantillaId = plantilla?.id as string | undefined;
    if (plantillaId) {
      await sql`
        update plantillas_whatsapp
        set mensaje = ${MENSAJE}, meta_idioma = 'es_CL', meta_variables = ${sql.json(META_VARIABLES)}
        where id = ${plantillaId}`;
      console.log(`\nPlantilla actualizada: ${plantillaId}`);
    } else {
      plantillaId = "c" + Date.now() + Math.floor(Math.random() * 1000);
      await sql`
        insert into plantillas_whatsapp
          (id, nombre, categoria, mensaje, activo, creado_en, meta_nombre, meta_idioma, meta_variables, meta_aprobado)
        values
          (${plantillaId}, ${NOMBRE}, 'Proceso de venta', ${MENSAJE}, true, now(),
           ${META_NOMBRE}, 'es_CL', ${sql.json(META_VARIABLES)}, false)`;
      console.log(`\nPlantilla creada: ${plantillaId}`);
    }

    if (regla) {
      await sql`
        update reglas_whatsapp set
          condicion_planes = ${sql.json([PLAN_ILIMITADO_LEGACY])},
          condicion_dias_antes_vencimiento = ${DIAS_ANTES},
          condicion_pasadas_min = ${PASADAS_MIN},
          plantilla_whatsapp_id = ${plantillaId}
        where id = ${regla.id}`;
      console.log(`Regla actualizada: ${regla.id}`);
    } else {
      const id = "c" + (Date.now() + 1) + Math.floor(Math.random() * 1000);
      await sql`
        insert into reglas_whatsapp
          (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_planes,
           condicion_dias_antes_vencimiento, condicion_pasadas_min, delay_dias, accion,
           cupon_es_porcentaje, cupon_valor, cupon_validez_dias, plantilla_whatsapp_id,
           creado_en, creado_por)
        values
          (${id}, ${NOMBRE}, false, 'plan_proximo_vencer', null,
           ${sql.json([PLAN_ILIMITADO_LEGACY])}, ${DIAS_ANTES}, ${PASADAS_MIN}, 0, 'mensaje_simple',
           false, null, null, ${plantillaId}, now(), 'script tmp-regla-whatsapp-fin-ilimitado')`;
      console.log(`Regla creada APAGADA: ${id}`);
    }

    if (PRENDER) {
      const ap = await sql`update plantillas_whatsapp set meta_aprobado = true where meta_nombre = ${META_NOMBRE} returning id`;
      const on = await sql`update reglas_whatsapp set activa = true where nombre = ${NOMBRE} returning id`;
      console.log(`Plantilla marcada aprobada: ${ap.length} | Regla PRENDIDA: ${on.length}`);
    } else {
      console.log(`\nQueda APAGADA hasta que Meta apruebe. Despues: --prender`);
    }
  }
} finally {
  await sql.end();
}
