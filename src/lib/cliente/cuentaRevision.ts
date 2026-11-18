// Cuenta para los revisores de Google Play y la App Store (18-nov-2026).
//
// El portal entra con un código que llega por correo, y los revisores no
// pueden leer nuestra casilla. Para este único correo el código es fijo: sale
// de la variable de entorno CODIGO_REVISION_TIENDAS (6 dígitos, solo en
// Vercel) y se declara en Play Console y App Store Connect. Sin la variable,
// el correo se comporta como cualquier otro.
//
// Todo lo demás del login sigue igual: el código caduca a los 5 minutos de
// pedirlo, 5 intentos por solicitud y los límites por IP y por correo de
// otp/solicitar. La ficha es la patente de prueba ZZZZ99, sin compras.
export const CORREO_REVISION = "revision@zplash.cl";

export function codigoFijoRevision(email: string): string | null {
  if (email.trim().toLowerCase() !== CORREO_REVISION) return null;
  const codigo = (process.env.CODIGO_REVISION_TIENDAS || "").trim();
  return /^\d{6}$/.test(codigo) ? codigo : null;
}

export function esCuentaRevision(email: string): boolean {
  return email.trim().toLowerCase() === CORREO_REVISION;
}
