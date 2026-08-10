import "server-only";

import { conConexionImap } from "./cliente";
import { listarCarpetas } from "./leer";

// Carpetas especiales del servidor (ver especialDe en leer.ts) — no se
// pueden renombrar ni borrar desde el panel: son las que el propio servidor
// (o Roundcube) trata distinto (Bandeja de entrada no tiene sentido tocarla;
// las demás son las que usan otras partes del código, ej. enviar.ts busca
// "sent" a ciegas para guardar la copia de lo enviado).
export async function crearCarpeta(nombre: string): Promise<boolean> {
  const limpio = nombre.trim();
  if (!limpio) return false;
  try {
    await conConexionImap((client) => client.mailboxCreate(limpio));
    return true;
  } catch (error) {
    console.error("Error creando carpeta IMAP", error);
    return false;
  }
}

export async function renombrarCarpeta(pathActual: string, nuevoNombre: string): Promise<boolean> {
  const limpio = nuevoNombre.trim();
  if (!limpio) return false;
  const carpetas = await listarCarpetas();
  const actual = carpetas.find((c) => c.path === pathActual);
  if (!actual || actual.especial) return false;
  try {
    await conConexionImap((client) => client.mailboxRename(pathActual, limpio));
    return true;
  } catch (error) {
    console.error("Error renombrando carpeta IMAP", error);
    return false;
  }
}

export async function eliminarCarpeta(path: string): Promise<boolean> {
  const carpetas = await listarCarpetas();
  const carpeta = carpetas.find((c) => c.path === path);
  if (!carpeta || carpeta.especial) return false;
  try {
    await conConexionImap((client) => client.mailboxDelete(path));
    return true;
  } catch (error) {
    console.error("Error eliminando carpeta IMAP", error);
    return false;
  }
}
