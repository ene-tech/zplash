"use server";

import * as dataAccess from "@/lib/dataAccess";
import { diaCaja } from "@/lib/helpers";
import { tieneAlgunModulo } from "@/lib/session";
import { emitirFactura, type ReceptorFactura } from "@/lib/simplefactura";

export type ResultadoFactura = { ok: true; folio: number } | { ok: false; error: string };

// Emite UNA factura electrónica por todas las ventas pedidas (deben ser del
// mismo RUT) y las deja marcadas como emitidas. Montos y receptor se leen de
// la base, nunca del navegador.
export async function emitirFacturaVentas(ventaIds: string[]): Promise<ResultadoFactura> {
  if (!(await tieneAlgunModulo(["cierre", "arqueo", "permisos"]))) return { ok: false, error: "Sin permiso" };
  // Las ya emitidas se saltan (re-emitirlas duplicaría la factura ante el SII),
  // pero no traban al resto del grupo.
  const ventas = (await dataAccess.ventasPorIds(ventaIds)).filter((v) => v.precio > 0 && !v.facturaEmitida);
  if (!ventas.length) return { ok: false, error: "No hay ventas con monto pendientes de factura" };

  // Compra web: los datos vienen en la venta. Cliente con Factura en su ficha:
  // vienen del cliente.
  const clientes = new Map((await dataAccess.getClientesByIds(ventas.map((v) => v.clienteId).filter(Boolean))).map((c) => [c.id, c]));
  const receptores: ReceptorFactura[] = ventas.map((v) => {
    const fuente = v.rut ? v : clientes.get(v.clienteId);
    return {
      rut: fuente?.rut || "",
      razonSocial: fuente?.razonSocial || "",
      giro: fuente?.giro || "",
      direccion: fuente?.direccion,
      email: fuente?.email,
    };
  });
  const receptor = receptores[0];
  const falta = [!receptor.rut && "RUT", !receptor.razonSocial && "razón social", !receptor.giro && "giro"].filter(Boolean);
  if (falta.length) return { ok: false, error: `Faltan datos de facturación: ${falta.join(", ")}` };
  if (receptores.some((r) => r.rut !== receptor.rut)) return { ok: false, error: "Las ventas son de RUTs distintos" };

  let folio: number;
  try {
    folio = await emitirFactura(ventas, receptor, diaCaja(new Date().toISOString()));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!(await dataAccess.marcarFacturaEmitida(ventas.map((v) => v.id)))) {
    // La factura ya existe en el SII: avisar el folio para no emitirla dos veces.
    return { ok: false, error: `Se emitió la factura N° ${folio} pero no se pudo marcar en la base. Márcala a mano como emitida.` };
  }
  return { ok: true, folio };
}
