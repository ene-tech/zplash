/** Datos de la cuenta bancaria de la empresa, mostrados al cliente cuando el operador elige "Transferencia bancaria" como forma de pago. */
// Las ventas/movimientos generados automáticamente por Webpay, WooCommerce u
// Oneclick (ver src/app/api/pagos/webpay/retorno/route.ts,
// src/app/api/webhooks/woocommerce/route.ts y aplicarPagoOneclick en
// src/lib/pagos.ts) siempre quedan con creadoPor = "Automático (...)" y
// metodoPago "tarjeta": son cobros web procesados por Transbank. Cualquier
// otro pago con tarjeta se cobra en el local con el POS GETNET.
export function esTarjetaWeb(creadoPor?: string | null): boolean {
  return (creadoPor || "").startsWith("Automático");
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

export const DATOS_TRANSFERENCIA = [
  { label: "Nombre", valor: "SERVICIOS E INVERSIONES LAS AGUILAS SPA" },
  { label: "RUT", valor: "76.969.928-7" },
  { label: "Cuenta Corriente Banco Santander", valor: "0-000-9448956-3" },
  { label: "Mail", valor: "TB@ZPLASH.CL" },
];
