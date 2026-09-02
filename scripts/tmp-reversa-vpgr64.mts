// One-off (ago-2026): reversa del "Lavado único" de $3.990 cobrado a VPGR64 el
// 27-08-2026. Fue producto del bug de ancla de ciclo corregido en cafed0e: el
// Operador vio "ya usó las 5 pasadas" (fecha_contratacion en null → periodoPlan
// caía a la ventana móvil de 1 mes) y la única opción en pantalla era cobrar el
// lavado adicional. El cliente nunca pagó.
//
// Borra SOLO la venta. El `ingreso` gemelo se conserva a propósito: esa pasada
// se le carga a las 5 del plan (ciclo vigente [23-ago, 23-sep), queda en 1/5).
// Verificado antes: la venta no tiene hijos en pagos_webpay / pagos_webpay_items
// / cobros_oneclick, y `cierres_caja` está vacía, así que no descuadra ningún
// cierre congelado.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-reversa-vpgr64.mts [--aplicar]
// Deja respaldo-reversa-vpgr64.json (rollback: reinsertar esa fila en `ventas`).
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const VENTA_ID = "v1787850563701";
const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const [venta] = await sql`SELECT * FROM ventas WHERE id = ${VENTA_ID} AND patente = 'VPGR64' AND precio = 3990`;
  if (!venta) {
    console.log("No hay nada que borrar: la venta ya no existe (o no calza patente/precio).");
    process.exit(0);
  }
  console.log(`Venta a borrar: ${venta.id} · ${venta.patente} · ${venta.tipo} · $${venta.precio} · ${venta.fecha.toISOString()}`);

  if (!aplicar) {
    console.log("\nDRY RUN. Volvé a correr con --aplicar para borrarla.");
    process.exit(0);
  }

  writeFileSync("respaldo-reversa-vpgr64.json", JSON.stringify(venta, null, 2));

  // El borrado y su rastro van juntos: `auditoria` se escribe a nivel de app
  // (ver commit() en AppContext), así que una edición manual no queda anotada
  // sola — y esta mueve plata.
  const [fila] = await sql`
    WITH borrada AS (DELETE FROM ventas WHERE id = ${VENTA_ID} RETURNING *)
    INSERT INTO auditoria (tabla, registro_id, accion, datos_anteriores, usuario)
    SELECT 'ventas', id, 'delete', to_jsonb(borrada),
           'Reversa manual: cobro indebido por bug de ancla de ciclo (cafed0e). El cliente nunca pago; la pasada se carga al plan.'
    FROM borrada
    RETURNING registro_id`;
  console.log(fila ? `Borrada y auditada: ${fila.registro_id}` : "No se borró nada.");
} finally {
  await sql.end();
}
