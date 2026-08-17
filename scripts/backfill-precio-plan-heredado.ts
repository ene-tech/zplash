// Carga por única vez `clientes.precio_plan_heredado` (ver precioConHeredado
// en @/lib/helpers/precios) para los clientes que venían pagando el plan a un
// precio anterior al vigente — el caso concreto: los ~186 clientes que
// migraron de WooCommerce pagando $19.990 cuando el plan de la app ya está en
// $21.990. Sin esto, en cuanto renuevan por la web (o inscriben su tarjeta en
// Oneclick) se les cobra el precio nuevo.
//
// Criterio: se marca al cliente cuyo ÚLTIMO pago de plan (venta de tipo
// "Plan nuevo"/"Renovación", en cualquiera de sus variantes Web/Oneclick) fue
// exactamente `--monto`. El último y no cualquiera del historial: quien ya
// pagó una vez el precio nuevo dejó de ser un cliente heredado.
//
// Deja fuera a propósito las ventas de Upgrade y Reactivación: esos son
// precios promocionales puntuales, no el precio del plan de ese cliente.
//
// Y solo clientes con plan vigente: al que ya se le venció no se le arrastra
// el precio viejo si vuelve (para eso están las promos de reactivación).
//
// Uso:
//   npx tsx --env-file=.env.local scripts/backfill-precio-plan-heredado.ts                     (dry-run: no escribe nada)
//   npx tsx --env-file=.env.local scripts/backfill-precio-plan-heredado.ts --monto 19990
//   npx tsx --env-file=.env.local scripts/backfill-precio-plan-heredado.ts --aplicar --csv respaldo.csv
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima,
// mismo patrón que scripts/auditar-datos-clientes.ts.

import { writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

function arg(nombre: string, porDefecto = ""): string {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

type Fila = {
  id: string;
  patente: string;
  nombre: string;
  vencimiento: string | null;
  precio_plan_heredado: number | null;
  ultimo_precio: string;
  ultima_fecha: string;
};

async function main() {
  const monto = Number(arg("--monto", "19990"));
  const aplicar = process.argv.includes("--aplicar");
  const csv = arg("--csv");
  if (!Number.isInteger(monto) || monto <= 0) throw new Error("--monto debe ser un entero positivo");

  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 3 });
  const db = drizzle(client);

  // Último pago de plan de cada cliente, sin contar upgrades ni reactivaciones.
  const candidatos = (await db.execute(sql`
    select c.id, c.patente, c.nombre, c.vencimiento, c.precio_plan_heredado,
           u.precio as ultimo_precio, u.fecha as ultima_fecha
    from clientes c
    join lateral (
      select v.precio, v.fecha from ventas v
      where v.cliente_id = c.id
        and (v.tipo ilike '%plan nuevo%' or v.tipo ilike '%renovaci%')
        and v.tipo not ilike '%upgrade%' and v.tipo not ilike '%reactivaci%'
      order by v.fecha desc limit 1
    ) u on true
    where u.precio = ${monto} and c.vencimiento >= now()
    order by c.patente
  `)) as unknown as Fila[];

  console.log(`Clientes cuyo último pago de plan fue $${monto.toLocaleString("es-CL")}: ${candidatos.length}`);
  const yaMarcados = candidatos.filter((c) => c.precio_plan_heredado === monto).length;
  if (yaMarcados) console.log(`  (${yaMarcados} ya tenían el precio heredado cargado, no cambian)`);

  // Los otros montos por debajo del precio vigente quedan a la vista pero NO se
  // tocan: son casos sueltos (montos raros, pagos de más de un mes, un cobro de
  // prueba) que hay que mirar uno por uno antes de grandfatherear a nadie.
  const otros = (await db.execute(sql`
    select u.precio, count(*) n from clientes c
    join lateral (
      select v.precio from ventas v
      where v.cliente_id = c.id
        and (v.tipo ilike '%plan nuevo%' or v.tipo ilike '%renovaci%')
        and v.tipo not ilike '%upgrade%' and v.tipo not ilike '%reactivaci%'
      order by v.fecha desc limit 1
    ) u on true
    where c.vencimiento >= now() and u.precio <> ${monto}
    group by u.precio order by n desc
  `)) as unknown as { precio: string; n: string }[];
  console.log("\nOtros últimos precios de plan entre los clientes con plan vigente (revisar a mano, no se tocan):");
  for (const o of otros) console.log(`  $${Number(o.precio).toLocaleString("es-CL")} → ${o.n} cliente(s)`);

  if (csv) {
    const filas = candidatos.map((c) =>
      [c.patente, c.nombre.replace(/[;\n]/g, " "), c.vencimiento ?? "", c.precio_plan_heredado ?? "", c.ultimo_precio, c.ultima_fecha].join(";")
    );
    writeFileSync(csv, ["patente;nombre;vencimiento;heredado_antes;ultimo_precio;ultima_fecha", ...filas].join("\n"), "utf8");
    console.log(`\nRespaldo escrito en ${csv}`);
  }

  if (!aplicar) {
    console.log("\nDRY-RUN: no se escribió nada. Volvé a correrlo con --aplicar para guardar.");
    await client.end();
    return;
  }

  const ids = candidatos.map((c) => c.id);
  if (!ids.length) {
    console.log("\nNada que actualizar.");
    await client.end();
    return;
  }
  await db.execute(sql`update clientes set precio_plan_heredado = ${monto} where id in ${sql`(${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`}`);
  console.log(`\nListo: ${ids.length} cliente(s) con precio heredado $${monto.toLocaleString("es-CL")}.`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
