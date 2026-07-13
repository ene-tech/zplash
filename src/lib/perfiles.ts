import "server-only";
import { eq } from "drizzle-orm";
import { perfiles } from "@/db/schema";
import { esHashBcrypt, hashClave, verificarClave } from "@/lib/auth";
import { getDb } from "@/db";

/**
 * Verifica una clave contra el valor almacenado (hash bcrypt o texto plano
 * legado, ver lib/auth.ts) y, si es válida y todavía está en texto plano, la
 * reemplaza por su hash — así los perfiles viejos quedan migrados solos en
 * el primer login/confirmación exitosa, sin necesidad de una migración
 * masiva ni de pedirle la clave a nadie de nuevo.
 */
export async function verificarYMigrarClave(id: string, claveIngresada: string, claveAlmacenada: string): Promise<boolean> {
  const ok = await verificarClave(claveIngresada, claveAlmacenada);
  if (ok && !esHashBcrypt(claveAlmacenada)) {
    await getDb()
      .update(perfiles)
      .set({ clave: await hashClave(claveIngresada) })
      .where(eq(perfiles.id, id));
  }
  return ok;
}
