// Deja armado el aviso del fin del Plan Ilimitado: la plantilla, la regla que
// lo manda 7 dias antes del vencimiento, y el ajuste del aviso de 4 dias para
// que los dos no se pisen.
//
// Por que 7 dias y por plan vigente: al cliente que viene del ilimitado la
// renovacion le escribe `plan = "Plan X5"` pero le conserva el mes sin tope que
// ya pago (ilimitadoHasta). Filtrar por la columna `plan` lo dejaba fuera; el
// cron ahora compara contra planVigente (ver cron.ts), asi que condicionPlanes
// = ["Plan Ilimitado Mensual"] agarra exactamente a quien esta USANDO el
// ilimitado hoy, sin importar que diga su ficha.
//
// El aviso de 4 dias ("No pierdas el Precio de tu Plan") queda acotado a
// Plan X5: sin eso, el mismo cliente recibia "tu plan termina" y tres dias
// despues "no pierdas tu precio", que se contradicen.
//
// Va con condicionSoloSinAutopago = true: al que se le renueva solo (Woo o
// Oneclick propio) su plan NO se termina, y el correo le mentiria. Eso deja
// afuera a 46 de Woo y 12 de Oneclick de los 195 que caen en la ventana.
//
// La regla nueva se crea APAGADA a proposito: prenderla dispara un envio real
// a todos los que vencen dentro de 7 dias, y esa es una decision de negocio.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-regla-fin-ilimitado.mts [--aplicar]
import postgres from "postgres";
import { CORREOS } from "./tmp-preview-correos-tope";

const APLICAR = process.argv.includes("--aplicar");
const PLAN_LEGACY = "Plan Ilimitado Mensual";
const DIAS_ANTES = 7;
const REGLA_4_DIAS = "AVISO - Cliente plan, por vencer (en 4 dias) sin PAC";

const correo = CORREOS[0];
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const yaPlantilla = await sql`select id, nombre from plantillas_correo where nombre = ${correo.nombre}`;
  const yaRegla = await sql`
    select id, nombre, activa from reglas_correo
    where tipo_evento = 'plan_proximo_vencer' and condicion_dias_antes_vencimiento = ${DIAS_ANTES}`;
  const alcance = await sql`
    select count(*)::int n from clientes
    where vencimiento >= now() and vencimiento <= now() + ${DIAS_ANTES} * interval '1 day'
      and (plan = ${PLAN_LEGACY} or (ilimitado_hasta is not null and ilimitado_hasta >= now()))
      and renovacion_auto_woo_desde is null
      and not exists (select 1 from suscripciones_oneclick s where s.patente = clientes.patente and s.estado = 'activa')`;

  console.log(`${APLICAR ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
  console.log(`1. Plantilla "${correo.nombre}"          -> ${yaPlantilla.length ? "YA EXISTE, no se toca" : "crear"}`);
  console.log(`2. Regla "Fin del Plan Ilimitado" (${DIAS_ANTES}d)   -> ${yaRegla.length ? "YA EXISTE, no se toca" : "crear APAGADA"}`);
  console.log(`3. Acotar "${REGLA_4_DIAS}" a Plan X5`);
  console.log(`\nSi la prendes hoy, le sale a ${(alcance as any[])[0].n} cliente(s) que vencen dentro de ${DIAS_ANTES} dias.`);

  if (!APLICAR) {
    console.log(`\n(dry-run: no se escribio nada. Correr con --aplicar.)`);
  } else {
    let plantillaId = (yaPlantilla as any[])[0]?.id;
    if (!plantillaId) {
      plantillaId = "c" + Date.now() + Math.floor(Math.random() * 1000);
      await sql`
        insert into plantillas_correo (id, nombre, categoria, asunto, cuerpo, activo, creado_en)
        values (${plantillaId}, ${correo.nombre}, 'Proceso de venta', ${correo.asunto}, ${correo.cuerpo}, true, now())`;
      console.log(`\nPlantilla creada: ${plantillaId}`);
    }

    if (!yaRegla.length) {
      const reglaId = "c" + (Date.now() + 1) + Math.floor(Math.random() * 1000);
      await sql`
        insert into reglas_correo
          (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_planes,
           condicion_dias_antes_vencimiento, condicion_solo_sin_autopago,
           condicion_solo_con_promo_renovacion, condicion_dias_despues_vencimiento,
           condicion_pasadas_max, delay_dias, plantilla_correo_id, creado_en, creado_por)
        values
          (${reglaId}, 'Fin del Plan Ilimitado', false, 'plan_proximo_vencer', null,
           ${sql.json([PLAN_LEGACY])}, ${DIAS_ANTES}, true, false, null, null, 0,
           ${plantillaId}, now(), 'script tmp-regla-fin-ilimitado')`;
      console.log(`Regla creada APAGADA: ${reglaId}`);
    }

    const r = await sql`
      update reglas_correo set condicion_planes = ${sql.json(["Plan X5"])}
      where nombre = ${REGLA_4_DIAS} returning id`;
    console.log(`Aviso de 4 dias acotado a Plan X5: ${r.length} regla(s)`);

    console.log("\n--- reglas de vencimiento ahora ---");
    for (const x of await sql`
      select nombre, activa, condicion_dias_antes_vencimiento dias, condicion_planes planes
      from reglas_correo where tipo_evento = 'plan_proximo_vencer' order by dias`)
      console.log(`  ${(x as any).activa ? "ON " : "OFF"} ${(x as any).dias}d  ${(x as any).nombre}  planes=${JSON.stringify((x as any).planes)}`);
  }
} finally {
  await sql.end();
}
