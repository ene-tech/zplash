// Corrida única (no expuesta en la UI): borra todos los registros de prueba
// creados bajo el nombre de cliente "prueba" (clientes, ventas, ingresos,
// citas y sus movimientos_contables asociados). Pensado para limpiar datos
// de testing manual antes de ir a producción.
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima.
//
// Uso: npx tsx --env-file=.env.local scripts/limpiar-datos-prueba.ts --dry-run
//      npx tsx --env-file=.env.local scripts/limpiar-datos-prueba.ts

import { drizzle } from "drizzle-orm/postgres-js";
import { ilike, inArray, or } from "drizzle-orm";
import postgres from "postgres";
import { citas, clientes, ingresos, movimientosContables, ventas } from "@/db/schema";

const NOMBRE_PRUEBA = "%prueba%";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client);

  const clientesPrueba = await db.select().from(clientes).where(ilike(clientes.nombre, NOMBRE_PRUEBA));
  const clienteIds = clientesPrueba.map((c) => c.id);

  const citasPrueba = await db
    .select()
    .from(citas)
    .where(clienteIds.length ? or(ilike(citas.nombre, NOMBRE_PRUEBA), inArray(citas.clienteId, clienteIds)) : ilike(citas.nombre, NOMBRE_PRUEBA));
  const ventasPrueba = await db
    .select()
    .from(ventas)
    .where(clienteIds.length ? or(ilike(ventas.nombre, NOMBRE_PRUEBA), inArray(ventas.clienteId, clienteIds)) : ilike(ventas.nombre, NOMBRE_PRUEBA));
  const ingresosPrueba = await db
    .select()
    .from(ingresos)
    .where(clienteIds.length ? or(ilike(ingresos.nombre, NOMBRE_PRUEBA), inArray(ingresos.clienteId, clienteIds)) : ilike(ingresos.nombre, NOMBRE_PRUEBA));

  const ventaIds = ventasPrueba.map((v) => v.id);
  const movimientosPrueba = await db
    .select()
    .from(movimientosContables)
    .where(ventaIds.length ? or(ilike(movimientosContables.contraparte, NOMBRE_PRUEBA), inArray(movimientosContables.ventaId, ventaIds)) : ilike(movimientosContables.contraparte, NOMBRE_PRUEBA));

  console.log(`Clientes "prueba": ${clientesPrueba.length}`);
  clientesPrueba.forEach((c) => console.log(`  - ${c.id} | ${c.nombre} | ${c.patente}`));
  console.log(`Citas "prueba": ${citasPrueba.length}`);
  citasPrueba.forEach((c) => console.log(`  - ${c.id} | ${c.nombre} | ${c.fechaHora}`));
  console.log(`Ventas "prueba": ${ventasPrueba.length}`);
  ventasPrueba.forEach((v) => console.log(`  - ${v.id} | ${v.nombre} | ${v.fecha} | $${v.precio}`));
  console.log(`Ingresos "prueba": ${ingresosPrueba.length}`);
  ingresosPrueba.forEach((i) => console.log(`  - ${i.id} | ${i.nombre} | ${i.fecha}`));
  console.log(`Movimientos contables "prueba": ${movimientosPrueba.length}`);
  movimientosPrueba.forEach((m) => console.log(`  - ${m.id} | ${m.descripcion} | $${m.monto} | ${m.estado}`));

  if (dryRun) {
    console.log("--dry-run: no se borró nada.");
    await client.end();
    return;
  }

  if (movimientosPrueba.length) {
    await db.delete(movimientosContables).where(inArray(movimientosContables.id, movimientosPrueba.map((m) => m.id)));
  }
  if (citasPrueba.length) {
    await db.delete(citas).where(inArray(citas.id, citasPrueba.map((c) => c.id)));
  }
  if (ventasPrueba.length) {
    await db.delete(ventas).where(inArray(ventas.id, ventasPrueba.map((v) => v.id)));
  }
  if (ingresosPrueba.length) {
    await db.delete(ingresos).where(inArray(ingresos.id, ingresosPrueba.map((i) => i.id)));
  }
  if (clienteIds.length) {
    await db.delete(clientes).where(inArray(clientes.id, clienteIds));
  }

  console.log("Listo. Se borraron los registros de prueba listados arriba.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
