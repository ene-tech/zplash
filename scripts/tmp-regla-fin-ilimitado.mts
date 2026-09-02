// Deja armado el aviso del fin del Plan Ilimitado: la plantilla, la regla que
// lo manda 7 dias antes del vencimiento, y el ajuste del aviso de 4 dias para
// que los dos no se pisen.
//
// A QUIEN LE LLEGA. Politica del 31-ago-2026: al del ilimitado viejo que usa
// PASES_INCLUIDOS_X5 pasadas o menos se le MANTIENE el plan y se le sigue
// cobrando; solo se le termina al que se pasa. Por eso la regla lleva
// condicionPasadasMin = 6 — sin eso le avisa a los dos grupos, y a los ~164 que
// se mantienen les estaria mintiendo. Lista exacta:
// scripts/diag-fin-ilimitado-publico.mts
//
// Dos filtros mas, arreglados en el cron para que esto funcione:
//   - condicionPlanes se compara contra planVigente y no contra `clientes.plan`:
//     al que renovo, la ficha le dice "Plan X5" aunque siga usando el mes sin
//     tope que ya pago (ilimitadoHasta).
//   - condicionSoloSinAutopago va en FALSE a proposito: al de 6+ pasadas le
//     corresponde el corte tenga o no cobro automatico, asi que igual hay que
//     avisarle.
//
// REQUIERE la columna condicion_pasadas_min en reglas_correo, que se aplica a
// mano en Supabase (las migraciones de drizzle estan desincronizadas):
//   alter table reglas_correo add column if not exists condicion_pasadas_min integer;
//
// Dos pasos a proposito, y el orden importa:
//   --aplicar  crea/actualiza la plantilla y la regla, APAGADA. No manda nada.
//   --prender  la enciende Y acota el aviso de 4 dias en el mismo momento.
// Acotar el de 4 dias antes de prender este dejaria a los del ilimitado sin
// ningun aviso de vencimiento en el intertanto.
//
// Uso: npx tsx --conditions=react-server --env-file=.env.local \
//        scripts/tmp-regla-fin-ilimitado.mts [--aplicar|--prender]
import postgres from "postgres";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY } from "@/lib/helpers/precios";
import { CORREOS } from "./tmp-preview-correos-tope";

const APLICAR = process.argv.includes("--aplicar");
const PRENDER = process.argv.includes("--prender");
const DIAS_ANTES = 7;
const PASADAS_MIN = PASES_INCLUIDOS_X5 + 1;
const NOMBRE_REGLA = "Fin del Plan Ilimitado";
const REGLA_4_DIAS = "AVISO - Cliente plan, por vencer (en 4 dias) sin PAC";

const correo = CORREOS[0];
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const tieneColumna = await sql`
    select 1 from information_schema.columns
    where table_name = 'reglas_correo' and column_name = 'condicion_pasadas_min'`;
  if (!tieneColumna.length) {
    console.error("FALTA la columna condicion_pasadas_min en reglas_correo.");
    console.error("Pegar esto en el SQL Editor de Supabase y volver a correr:\n");
    console.error("  alter table reglas_correo add column if not exists condicion_pasadas_min integer;\n");
    process.exit(1);
  }

  const [plantilla] = await sql`select id from plantillas_correo where nombre = ${correo.nombre}`;
  const [regla] = await sql`select id, activa from reglas_correo where nombre = ${NOMBRE_REGLA}`;

  console.log(`${APLICAR || PRENDER ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
  console.log(`Plantilla "${correo.nombre}" -> ${plantilla ? `existe (${plantilla.id}), se actualiza el texto` : "crear"}`);
  console.log(`Regla "${NOMBRE_REGLA}" -> ${regla ? `existe (${regla.id}, activa=${regla.activa}), se actualizan condiciones` : "crear APAGADA"}`);
  console.log(`   ${DIAS_ANTES} dias antes | plan vigente = ${PLAN_ILIMITADO_LEGACY} | pasadas del ciclo >= ${PASADAS_MIN} | sin filtro de autopago`);
  console.log(`Aviso de 4 dias -> acotar a Plan X5 ${PRENDER ? "AHORA" : "recien con --prender"}`);
  console.log(`\nPublico exacto: npx tsx --env-file=.env.local scripts/diag-fin-ilimitado-publico.mts ${DIAS_ANTES}`);

  if (!APLICAR && !PRENDER) {
    console.log(`\n(dry-run: no se escribio nada. Correr con --aplicar.)`);
  } else {
    let plantillaId = plantilla?.id as string | undefined;
    if (plantillaId) {
      await sql`update plantillas_correo set asunto = ${correo.asunto}, cuerpo = ${correo.cuerpo} where id = ${plantillaId}`;
      console.log(`\nPlantilla actualizada: ${plantillaId}`);
    } else {
      plantillaId = "c" + Date.now() + Math.floor(Math.random() * 1000);
      await sql`
        insert into plantillas_correo (id, nombre, categoria, asunto, cuerpo, activo, creado_en)
        values (${plantillaId}, ${correo.nombre}, 'Proceso de venta', ${correo.asunto}, ${correo.cuerpo}, true, now())`;
      console.log(`\nPlantilla creada: ${plantillaId}`);
    }

    if (regla) {
      await sql`
        update reglas_correo set
          condicion_planes = ${sql.json([PLAN_ILIMITADO_LEGACY])},
          condicion_dias_antes_vencimiento = ${DIAS_ANTES},
          condicion_pasadas_min = ${PASADAS_MIN},
          condicion_solo_sin_autopago = false,
          plantilla_correo_id = ${plantillaId}
        where id = ${regla.id}`;
      console.log(`Regla actualizada: ${regla.id}`);
    } else {
      const id = "c" + (Date.now() + 1) + Math.floor(Math.random() * 1000);
      await sql`
        insert into reglas_correo
          (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_planes,
           condicion_dias_antes_vencimiento, condicion_solo_sin_autopago,
           condicion_solo_con_promo_renovacion, condicion_dias_despues_vencimiento,
           condicion_pasadas_max, condicion_pasadas_min, delay_dias, plantilla_correo_id,
           creado_en, creado_por)
        values
          (${id}, ${NOMBRE_REGLA}, false, 'plan_proximo_vencer', null,
           ${sql.json([PLAN_ILIMITADO_LEGACY])}, ${DIAS_ANTES}, false, false, null, null,
           ${PASADAS_MIN}, 0, ${plantillaId}, now(), 'script tmp-regla-fin-ilimitado')`;
      console.log(`Regla creada APAGADA: ${id}`);
    }

    if (PRENDER) {
      const on = await sql`update reglas_correo set activa = true where nombre = ${NOMBRE_REGLA} returning id`;
      console.log(`Regla PRENDIDA: ${on.length}`);
      const r = await sql`
        update reglas_correo set condicion_planes = ${sql.json(["Plan X5"])}
        where nombre = ${REGLA_4_DIAS} returning id`;
      console.log(`Aviso de 4 dias acotado a Plan X5: ${r.length} regla(s)`);
    } else {
      console.log(`\nEl aviso de 4 dias NO se toco: se acota junto con --prender, para no dejar`);
      console.log(`a los del ilimitado sin ningun aviso en el intertanto.`);
    }

    console.log("\n--- reglas de vencimiento ahora ---");
    for (const x of (await sql`
      select nombre, activa, condicion_dias_antes_vencimiento dias, condicion_planes planes,
             condicion_pasadas_min pmin, condicion_solo_sin_autopago sinauto
      from reglas_correo where tipo_evento = 'plan_proximo_vencer' order by dias`) as any[])
      console.log(
        `  ${x.activa ? "ON " : "OFF"} ${x.dias}d  ${String(x.nombre).slice(0, 46).padEnd(46)}` +
          ` planes=${JSON.stringify(x.planes)} pasadas>=${x.pmin ?? "-"} sinAutopago=${x.sinauto}`
      );
  }
} finally {
  await sql.end();
}
