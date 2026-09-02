// Exposición que queda del corte de cobros de WooCommerce (SOLO LECTURA).
import { writeFileSync } from "node:fs";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });
const HOY = sql`(now() at time zone 'America/Santiago')::date`;
async function main() {
  console.log("== estado de la base ==");
  console.log(JSON.stringify((await sql`
    select count(*) filter (where renovacion_auto_woo_desde is not null) marca_woo_activa,
           count(*) filter (where suscripcion_cancelada_en is not null) cancelaciones_registradas,
           max(suscripcion_cancelada_en)::date ultima_cancelacion
    from clientes`)[0]));

  const enRiesgo = await sql`
    select c.patente, c.nombre, c.email, c.telefono, c.plan, c.vencimiento::date vence,
           (c.vencimiento::date - ${HOY}) dias,
           case when c.vencimiento::date < ${HOY} then 'ya vencido, sin cobrar' else 'vence pronto, el cobro Woo no va a llegar' end estado,
           coalesce(c.precio_plan_heredado, 21990) monto,
           exists (select 1 from suscripciones_oneclick s where s.patente = c.patente and s.estado = 'activa') ya_tiene_oneclick
    from clientes c
    where c.renovacion_auto_woo_desde is not null and c.vencimiento::date < ${HOY} + interval '17 days'
    order by c.vencimiento`;

  const vencidos = enRiesgo.filter((c) => Number(c.dias) < 0);
  const proximos = enRiesgo.filter((c) => Number(c.dias) >= 0);
  const suma = (fs: readonly Record<string, unknown>[]) => fs.reduce((t, f) => t + Number(f.monto), 0);
  console.log(`\nYa vencidos con cobro Woo muerto: ${vencidos.length} — $${suma(vencidos).toLocaleString("es-CL")}`);
  console.log(`Vencen de aquí al 16-sep (el cobro Woo no va a llegar): ${proximos.length} — $${suma(proximos).toLocaleString("es-CL")}`);
  console.log(`De todos ellos ya inscribieron tarjeta con nosotros: ${enRiesgo.filter((c) => c.ya_tiene_oneclick).length}`);

  const cols = Object.keys(enRiesgo[0]);
  const csv = [cols.join(";"), ...enRiesgo.map((c) => cols.map((k) => {
    const v = (c as Record<string, unknown>)[k];
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").replace(/;/g, ",");
  }).join(";"))];
  writeFileSync("woo-a-recuperar-2026-08-31.csv", "﻿" + csv.join("\n"), "utf8");
  console.log(`\nCSV: woo-a-recuperar-2026-08-31.csv (${enRiesgo.length} clientes)`);
  await sql.end();
}
main();
