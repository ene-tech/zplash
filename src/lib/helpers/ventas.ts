/** Datos de la cuenta bancaria de la empresa, mostrados al cliente cuando el operador elige "Transferencia bancaria" como forma de pago. */
// Las ventas/movimientos generados automáticamente por Webpay, WooCommerce u
// Oneclick (ver src/app/api/pagos/webpay/retorno/route.ts,
// src/app/api/webhooks/woocommerce/route.ts y aplicarPagoOneclick en
// src/lib/pagos.ts) siempre quedan con creadoPor = "Automático (...)" y
// metodoPago "tarjeta": son cobros web procesados por Transbank. Cualquier
// otro pago con tarjeta se cobra en el local con el POS GETNET.
export function esTarjetaWeb(creadoPor?: string | null): boolean {
  const autor = creadoPor || "";
  // "Cliente (Oneclick)" son los cobros que el propio cliente gatilla desde
  // Mi Cuenta contra su tarjeta ya inscrita (ver cobrarOfertaOneclick): los
  // procesa Transbank igual que los "Automático (Oneclick)" del cron mensual,
  // no el POS GETNET del local.
  return autor.startsWith("Automático") || autor.includes("(Oneclick)");
}

// Distingue, dentro de las ventas web automáticas, las que vienen del
// webhook de WooCommerce (wordpress.zplash.cl, sigue vigente solo para
// planes) de las que vienen de la plataforma de venta propia (checkout
// Webpay nativo — ver src/app/api/pagos/webpay/retorno/route.ts — y sus
// renovaciones Oneclick — ver cobrarSuscripcion en src/lib/pagos). El texto
// "Automático (Web)" es exacto (con o sin el sufijo "— posible duplicado…"
// que agrega el webhook, ver route.ts); no es prefijo de "Automático
// (Webpay)" porque diverge justo después de "Web".
export function esWooCommerce(creadoPor?: string | null): boolean {
  return (creadoPor || "").startsWith("Automático (Web)");
}

export function esVentaNuevaWeb(creadoPor?: string | null): boolean {
  return esTarjetaWeb(creadoPor) && !esWooCommerce(creadoPor);
}

/** Tipos de venta que nadie tipea en el mesón: los generan el checkout web /
 * el webhook de WooCommerce (los "(Web)") o el módulo de Venta Empresa al
 * emitir un lote de cupones. */
const TIPOS_VENTA_NO_MANUAL = new Set(["Plan nuevo (Web)", "Renovación (Web)", "Cupón Venta Empresa"]);

/** true si la venta la generó la plataforma y no una persona: un cobro por
 * Transbank (checkout Webpay, renovación Oneclick, webhook de WooCommerce) o
 * un lote de Venta Empresa. Ninguna pantalla las deja reclasificar ni cambiar
 * de medio de pago (ver el backstop en upsertVentas de @/lib/serverActions):
 * en una venta que registró sola la plataforma no hubo persona que se pudiera
 * equivocar. Se mira `creadoPor` además del tipo porque es lo que distingue un
 * cobro web de uno hecho en el local. */
export function esVentaAutomatica(venta: { creadoPor?: string | null; tipo: string }): boolean {
  return esTarjetaWeb(venta.creadoPor) || TIPOS_VENTA_NO_MANUAL.has(venta.tipo);
}


export const DATOS_TRANSFERENCIA = [
  { label: "Nombre", valor: "SERVICIOS E INVERSIONES LAS AGUILAS SPA" },
  { label: "RUT", valor: "76.969.928-7" },
  { label: "Cuenta Corriente Banco Santander", valor: "0-000-9448956-3" },
  { label: "Mail", valor: "TB@ZPLASH.CL" },
];
