import type { DestinoInventario, MovimientoInventario, Producto } from "@/types";
import { limpiarRut } from "./validadores";

/** Cantidad de `producto` disponible en cada destino (Bodega + vending), a
 * partir de los traspasos registrados en `movimientos`. No hay una columna de
 * "cantidad actual por destino" guardada: cada traspaso suma al destino y
 * resta al origen, y Bodega (el destino con `esBodega`) además arranca con
 * `producto.stock` completo — así el total repartido entre todos los
 * destinos siempre cuadra con el stock general del producto, sin importar
 * cuántos traspasos haya entre destinos que no sean Bodega. */
export function stockPorDestino(
  producto: Pick<Producto, "id" | "stock">,
  destinos: DestinoInventario[],
  movimientos: MovimientoInventario[]
): Map<string, number> {
  const porDestino = new Map<string, number>();
  for (const d of destinos) porDestino.set(d.id, d.esBodega ? producto.stock : 0);
  for (const m of movimientos) {
    if (m.productoId !== producto.id) continue;
    porDestino.set(m.origenId, (porDestino.get(m.origenId) ?? 0) - m.cantidad);
    porDestino.set(m.destinoId, (porDestino.get(m.destinoId) ?? 0) + m.cantidad);
  }
  return porDestino;
}

/** true si `producto` puede estar en `destino` — false si está en su lista de
 * destinos bloqueados (ver Producto.destinosBloqueados en @/types, ej. un
 * paño no debería poder cargarse en la máquina "Vending Café"). Sin lista
 * (undefined/vacía) = permitido en todos los destinos. Bodega siempre está
 * permitida sin importar la lista guardada: es el origen implícito de todo
 * Producto.stock (ver stockPorDestino más arriba) y bloquearla dejaría el
 * stock sin ningún destino válido — la UI (ProductoModal) ya no permite
 * marcarla, esto además cubre datos viejos guardados antes de ese resguardo. */
export function productoPermitidoEnDestino(
  producto: Pick<Producto, "destinosBloqueados">,
  destino: Pick<DestinoInventario, "id" | "esBodega">
): boolean {
  return destino.esBodega || !producto.destinosBloqueados?.includes(destino.id);
}

/** Busca un proveedor del directorio por RUT, comparando RUTs limpios (ver
 * limpiarRut): el RUT guardado y el tipeado pueden venir con o sin puntos,
 * y comparar los textos formateados dejaba fuera coincidencias válidas. Lo
 * usa el formulario de Egresos para autocompletar el asiento (nombre y tipo
 * de gasto) apenas se ingresa el RUT. */
export function buscarProveedorPorRut<T extends { rut?: string }>(proveedores: T[], rut: string): T | undefined {
  const buscado = limpiarRut(rut);
  if (!buscado) return undefined;
  return proveedores.find((p) => p.rut && limpiarRut(p.rut) === buscado);
}
