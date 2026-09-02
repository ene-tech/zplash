// Ledger de dobles cobros de plan (SOLO LECTURA): pares de ventas de plan del
// mismo cliente separadas por menos de 5 días, con qué recibió el cliente a
// cambio del segundo cargo (si le extendió el ciclo o no) para decidir entre
// devolver o acreditar.
import { writeFileSync } from "node:fs";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });

async function main() {
  const filas = await sql`
    with vp as (
      select v.*, lag(v.fecha) over (partition by v.cliente_id order by v.fecha) pf,
             lag(v.tipo) over (partition by v.cliente_id order by v.fecha) pt,
             lag(v.precio) over (partition by v.cliente_id order by v.fecha) pp,
             lag(v.creado_por) over (partition by v.cliente_id order by v.fecha) ppor,
             lag(v.id) over (partition by v.cliente_id order by v.fecha) pid
      from ventas v where v.tipo not ilike '%lavado%' and v.plan <> '' and v.es_servicio_adicional = false)
    select c.patente, c.nombre, c.email, c.telefono, c.vencimiento::date vence,
           (c.vencimiento::date - (now() at time zone 'America/Santiago')::date) dias_por_delante,
           vp.pid venta_1, vp.pf::date fecha_1, vp.pt tipo_1, vp.pp::int monto_1, coalesce(vp.ppor,'?') canal_1,
           vp.id venta_2, vp.fecha::date fecha_2, vp.tipo tipo_2, vp.precio::int monto_2, coalesce(vp.creado_por,'?') canal_2,
           case when vp.ppor ilike 'Autom%' and vp.creado_por ilike 'Autom%' then 'dos cobros automáticos'
                when vp.ppor ilike 'Autom%' or vp.creado_por ilike 'Autom%' then 'automático + mesón'
                else 'dos veces en el mesón' end patron
    from vp join clientes c on c.id = vp.cliente_id
    where vp.pf is not null and vp.fecha - vp.pf < interval '5 days'
      and coalesce(vp.ppor,'') not ilike 'Migraci%' and coalesce(vp.creado_por,'') not ilike 'Migraci%'
    order by vp.fecha desc`;

  // El segundo cargo "se convirtió en servicio" si al cliente le quedó más de
  // un ciclo por delante: ahí ya tiene el mes pagado y corresponde acreditar,
  // no devolver. Si no, cobró dos veces el mismo mes.
  const conCredito = filas.filter((f) => Number(f.dias_por_delante) > 20);
  const sinNada = filas.filter((f) => Number(f.dias_por_delante) <= 20);
  const suma = (fs: readonly Record<string, unknown>[]) => fs.reduce((t, f) => t + Number(f.monto_2), 0);
  console.log(`Dobles cobros: ${filas.length} pares, $${suma(filas).toLocaleString("es-CL")} en el segundo cargo`);
  console.log(`  ya acreditado como ciclo extra (vence a más de 20 días): ${conCredito.length} — $${suma(conCredito).toLocaleString("es-CL")}`);
  console.log(`  cobrado dos veces el mismo mes (a devolver): ${sinNada.length} — $${suma(sinNada).toLocaleString("es-CL")}`);
  for (const p of ["dos cobros automáticos", "automático + mesón", "dos veces en el mesón"]) {
    const g = filas.filter((f) => f.patron === p);
    console.log(`\n${p}: ${g.length} — $${suma(g).toLocaleString("es-CL")}`);
    for (const f of g.slice(0, 5)) console.log(`   ${f.patente} ${f.nombre} — $${f.monto_1} (${f.canal_1}) ${f.fecha_1.toISOString().slice(5, 10)} + $${f.monto_2} (${f.canal_2}) ${f.fecha_2.toISOString().slice(5, 10)} → vence ${f.vence?.toISOString().slice(0, 10)}`);
    if (g.length > 5) console.log(`   ... y ${g.length - 5} más`);
  }

  const cols = Object.keys(filas[0]);
  const csv = [["accion_sugerida", ...cols].join(";")];
  for (const f of filas) {
    const accion = Number(f.dias_por_delante) > 20 ? "acreditar (ya tiene el ciclo extra)" : "devolver";
    csv.push([accion, ...cols.map((k) => {
      const v = (f as Record<string, unknown>)[k];
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").replace(/;/g, ",");
    })].join(";"));
  }
  writeFileSync("dobles-cobros-2026-08-31.csv", "﻿" + csv.join("\n"), "utf8");
  console.log(`\nCSV: dobles-cobros-2026-08-31.csv (${filas.length} pares)`);
  await sql.end();
}
main();
