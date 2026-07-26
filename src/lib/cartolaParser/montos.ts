export function parseMontoCLP(texto: string | undefined): number {
  if (!texto) return 0;
  const digitos = texto.replace(/[^\d]/g, "");
  return digitos ? parseInt(digitos, 10) : 0;
}

export function esFechaCompleta(texto: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(texto.trim());
}

/** "01/06/2026" -> ISO al mediodía, mismo criterio que MovimientoContableTab (evita corrimientos de huso horario al mostrar solo la fecha). */
export function fechaCartolaAISO(texto: string): string {
  const [dd, mm, yyyy] = texto.trim().split("/");
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00`).toISOString();
}
