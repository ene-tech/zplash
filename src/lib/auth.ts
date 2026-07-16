import crypto from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_HASH_RE = /^\$2[aby]\$/;

/** Perfiles creados antes de este cambio tienen la clave en texto plano; se migran solas al hashearse en el próximo login exitoso. */
export function esHashBcrypt(valor: string): boolean {
  return BCRYPT_HASH_RE.test(valor);
}

export async function hashClave(clave: string): Promise<string> {
  return bcrypt.hash(clave, 10);
}

/** Compara una clave ingresada contra el valor almacenado, sea hash bcrypt o texto plano (legado). */
export async function verificarClave(claveIngresada: string, claveAlmacenada: string): Promise<boolean> {
  if (esHashBcrypt(claveAlmacenada)) {
    return bcrypt.compare(claveIngresada, claveAlmacenada);
  }
  // Texto plano (legado, ver esHashBcrypt): comparación en tiempo constante
  // igual que la firma de sesión (ver firmaValida en @/lib/session), en vez
  // de "===" que corta apenas encuentra el primer byte distinto.
  const ingresada = Buffer.from(claveIngresada);
  const almacenada = Buffer.from(claveAlmacenada);
  return ingresada.length === almacenada.length && crypto.timingSafeEqual(ingresada, almacenada);
}
