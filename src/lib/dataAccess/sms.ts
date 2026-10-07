import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, mensajesSms } from "@/db/schema";

export type EstadoMensajeSms = "pendiente" | "enviado" | "fallido";

// Se inserta ANTES de llamar al proveedor (estado "pendiente"): así el código
// de baja queda reservado (unique) y, si la función se corta a mitad del envío,
// queda rastro de a quién se le estaba mandando. Devuelve false si el código
// de baja ya existía, para que quien llama genere otro.
export async function insertarMensajeSmsPendiente(row: {
  id: string;
  clienteId: string | null;
  telefono: string;
  campana: string;
  texto: string;
  segmentos: number;
  codigoBaja: string;
  enviadoPor?: string;
}): Promise<boolean> {
  const insertados = await getDb()
    .insert(mensajesSms)
    .values({ ...row, estado: "pendiente" })
    .onConflictDoNothing({ target: mensajesSms.codigoBaja })
    .returning({ id: mensajesSms.id });
  return insertados.length > 0;
}

export async function marcarMensajeSms(id: string, cambios: { estado: EstadoMensajeSms; proveedorId?: string; error?: string }): Promise<void> {
  await getDb().update(mensajesSms).set(cambios).where(eq(mensajesSms.id, id));
}

// Clientes de `clienteIds` que ya tienen un SMS enviado (o en curso) de esta
// campaña — el envío masivo los salta, para que reintentar un lote cortado no
// le mande dos veces lo mismo a nadie. Los "fallido" sí se reintentan.
export async function clienteIdsConSmsDeCampana(campana: string, clienteIds: string[]): Promise<string[]> {
  if (!clienteIds.length) return [];
  const rows = await getDb()
    .selectDistinct({ clienteId: mensajesSms.clienteId })
    .from(mensajesSms)
    .where(and(eq(mensajesSms.campana, campana), inArray(mensajesSms.clienteId, clienteIds), inArray(mensajesSms.estado, ["pendiente", "enviado"])));
  return rows.map((r) => r.clienteId).filter((id): id is string => !!id);
}

// Para la página pública /b/[codigo]: solo la patente (para que el cliente
// confirme que es su auto) y si ya está dado de baja. Nada más del cliente.
export async function buscarClientePorCodigoBajaSms(codigo: string): Promise<{ patente: string; yaDeBaja: boolean } | null> {
  const rows = await getDb()
    .select({ patente: clientes.patente, sinComunicacionAuto: clientes.sinComunicacionAuto })
    .from(mensajesSms)
    .innerJoin(clientes, eq(clientes.id, mensajesSms.clienteId))
    .where(eq(mensajesSms.codigoBaja, codigo))
    .limit(1);
  return rows[0] ? { patente: rows[0].patente, yaDeBaja: rows[0].sinComunicacionAuto } : null;
}

// Baja pedida desde el link del SMS: marca sinComunicacionAuto, el mismo
// opt-out que se marca a mano en la ficha del Operador y que ya respetan las
// reglas de WhatsApp, las de correo y el envío masivo de SMS.
export async function darDeBajaPorCodigoSms(codigo: string): Promise<boolean> {
  const [mensaje] = await getDb()
    .select({ clienteId: mensajesSms.clienteId })
    .from(mensajesSms)
    .where(eq(mensajesSms.codigoBaja, codigo))
    .limit(1);
  if (!mensaje?.clienteId) return false;
  await getDb().update(clientes).set({ sinComunicacionAuto: true }).where(eq(clientes.id, mensaje.clienteId));
  return true;
}
