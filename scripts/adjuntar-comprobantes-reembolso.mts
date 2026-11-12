// Deja el PDF del comprobante de devolución en "Documentos adjuntos" de la
// ficha para las devoluciones por Transbank hechas antes de que el reembolso
// lo adjuntara solo (12-nov-2026). Idempotente: el id del adjunto es fijo por
// reembolso, correrlo dos veces no duplica.
//
// Uso (sin --aplicar solo lista):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/adjuntar-comprobantes-reembolso.mts
//   npx tsx --conditions=react-server --env-file=.env.local scripts/adjuntar-comprobantes-reembolso.mts --aplicar
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clienteAdjuntos } from "@/db/schema/clienteAdjuntos";
import { ventas } from "@/db/schema/ventas";
import { CREADO_POR_REEMBOLSO, TIPO_VENTA_REEMBOLSO } from "@/lib/helpers/ventas";
import { adjuntarComprobanteReembolso, idAdjuntoComprobante } from "@/lib/pagos/comprobanteReembolso";

const aplicar = process.argv.includes("--aplicar");
const db = getDb();

const reembolsos = await db
  .select({ id: ventas.id, patente: ventas.patente, precio: ventas.precio, fecha: ventas.fecha })
  .from(ventas)
  // Sin cliente no hay ficha donde dejarlo.
  .where(and(eq(ventas.tipo, TIPO_VENTA_REEMBOLSO), eq(ventas.creadoPor, CREADO_POR_REEMBOLSO), isNotNull(ventas.clienteId)));
const ya = new Set(
  (
    await db
      .select({ id: clienteAdjuntos.id })
      .from(clienteAdjuntos)
      .where(inArray(clienteAdjuntos.id, reembolsos.map((r) => idAdjuntoComprobante(r.id))))
  ).map((r) => r.id)
);
const pendientes = reembolsos.filter((r) => !ya.has(idAdjuntoComprobante(r.id)));
console.log(`${reembolsos.length} devoluciones por Transbank; ${ya.size} ya con comprobante adjunto; ${pendientes.length} por adjuntar.`);

let ok = 0;
for (const r of pendientes) {
  if (!aplicar) {
    console.log(`  ${r.patente}  ${r.precio}  ${String(r.fecha).slice(0, 10)}  ${r.id}`);
    continue;
  }
  const hecho = await adjuntarComprobanteReembolso(r.id);
  console.log(`  ${hecho ? "OK  " : "FALLÓ"} ${r.patente}  ${r.id}`);
  if (hecho) ok++;
}
if (aplicar) console.log(`Adjuntados: ${ok} de ${pendientes.length}.`);
else console.log("Sin --aplicar: no se escribió nada.");
process.exit(0);
