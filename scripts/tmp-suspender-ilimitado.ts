import fs from "fs";
import postgres from "postgres";

/**
 * Suspende las suscripciones Oneclick de los clientes de Plan Ilimitado
 * Mensual que quedaron vencidos: inscribieron la tarjeta por "Mis tarjetas"
 * (rama esSoloTarjeta de /api/pagos/oneclick/inscripcion/retorno, que NO cobra
 * al inscribir) para migrar de la suscripción de WooCommerce, y nunca
 * autorizaron un plan X5.
 *
 * Cobrarlos los convertiría: aplicarPagoAprobado fija `plan = PLANES[0]` (X5)
 * y `ilimitadoHasta = ilimitadoHastaAlRenovar(...)`, que devuelve null cuando
 * el plan ya venció — o sea pierden el ilimitado de inmediato, sin el mes de
 * arrastre que sí les tocaría si el cobro hubiera corrido antes de vencer.
 *
 * "suspendida" y no "cancelada" a propósito: mismo estado que pone el botón
 * Suspender del panel (ver suspenderSuscripcionOneclick). La tarjeta queda
 * inscrita en Transbank y se reactiva desde Admin → Suscripciones cuando el
 * cliente autorice las condiciones nuevas. El cron solo mira estado 'activa',
 * así que a partir de acá no los toca.
 *
 * Dry-run por defecto. Escribe con `--apply`.
 */

const APLICAR = process.argv.includes("--apply");

const PATENTES = ["RXKP44", "LBHR45", "VLXR60", "HLXL70", "KVDZ13", "LCYD85", "LVRG66", "JBVH39", "TYGL56"];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

  const objetivo = await sql`
    select s.id, s.patente, c.nombre, s.estado, s.card_ultimos_digitos,
           to_char(c.vencimiento at time zone 'America/Santiago','YYYY-MM-DD') as vencimiento,
           to_char(s.proximo_cobro at time zone 'America/Santiago','YYYY-MM-DD') as proximo_cobro
    from suscripciones_oneclick s join clientes c on c.patente = s.patente
    where s.patente in ${sql(PATENTES)} and s.estado = 'activa'
    order by s.proximo_cobro`;

  console.log(`A SUSPENDER: ${objetivo.length} de ${PATENTES.length}`);
  for (const f of objetivo) {
    console.log(`  ${String(f.patente).padEnd(7)} ${String(f.nombre).slice(0, 30).padEnd(30)} vence ${f.vencimiento}  prox ${f.proximo_cobro ?? "-"}  tarjeta ${f.card_ultimos_digitos}`);
  }
  const faltan = PATENTES.filter((p) => !objetivo.some((f) => f.patente === p));
  if (faltan.length) console.log(`\n  OJO, no estaban 'activa': ${faltan.join(", ")}`);

  fs.writeFileSync(
    "respaldo-suspension-ilimitado-2026-08-30.json",
    JSON.stringify({ generadoEn: new Date().toISOString(), aplicado: APLICAR, suscripciones: objetivo }, null, 2),
    "utf8"
  );
  console.log("\nRespaldo en respaldo-suspension-ilimitado-2026-08-30.json");

  if (!APLICAR) {
    console.log("\n--- DRY RUN, no se escribió nada. Correr con --apply para aplicar. ---");
    await sql.end();
    return;
  }

  await sql`
    update suscripciones_oneclick
    set estado = 'suspendida', actualizado_en = now()
    where id in ${sql(objetivo.map((f) => f.id as string))}`;
  console.log("\nSuspendidas.");

  const restantes = await sql`
    select s.patente, c.nombre, c.plan,
           to_char(s.proximo_cobro at time zone 'America/Santiago','YYYY-MM-DD') as proximo_cobro
    from suscripciones_oneclick s join clientes c on c.patente = s.patente
    where s.estado = 'activa' and s.tbk_user is not null and s.proximo_cobro <= now()
    order by s.proximo_cobro`;
  console.log(`\nQueda para cobrar cuando el cron vuelva: ${restantes.length}`);
  for (const f of restantes) console.log(`  ${String(f.patente).padEnd(7)} ${String(f.nombre).slice(0, 30).padEnd(30)} ${f.plan}`);

  await sql.end();
}
main();
