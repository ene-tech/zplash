import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { formatTelefono, isValidTelefono, TELEFONO_FORMATO_MSG, telefonoTipeado } from "@/lib/helpers";

/** ¿La patente es de la cuenta que mandó el request? La cookie firmada se lee
 * primero porque no pega a la base: el comprador anónimo de /pagar —el caso
 * normal de estas rutas, que son públicas— no gasta una consulta de más. */
export async function esPatenteDeLaSesion(patente: string): Promise<boolean> {
  const sesion = await leerSesionCliente();
  if (!sesion) return false;
  const cliente = await buscarClientePorPatente(patente);
  return !!cliente && sesion.clienteIds.includes(cliente.id);
}

/**
 * Celular del comprador web, en el formato canónico (+569XXXXXXXX) con que
 * el bot de WhatsApp busca la ficha (ver clientes.telefono en el router). Sin
 * él, el cliente que compró por la web y después escribe por WhatsApp no
 * queda asociado a ningún auto.
 *
 * Obligatorio en /pagar y /carrito. Desde Mi Cuenta no se pide: ahí el
 * cliente ya entró con su cuenta y la patente es suya (esPatenteDeLaSesion),
 * así que si viene vacío se acepta sin teléfono.
 */
export async function telefonoDeCompra(
  raw: unknown,
  patente: string
): Promise<{ telefono: string | null; error?: undefined } | { telefono?: undefined; error: string }> {
  const tipeado = telefonoTipeado(typeof raw === "string" ? raw : "");
  if (!tipeado) {
    if (await esPatenteDeLaSesion(patente)) return { telefono: null };
    return { error: "Ingresa tu celular: lo usamos para reconocerte si nos escribes por WhatsApp." };
  }
  if (!isValidTelefono(tipeado)) return { error: TELEFONO_FORMATO_MSG };
  return { telefono: formatTelefono(tipeado) };
}
