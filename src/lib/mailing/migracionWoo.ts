import "server-only";

import { and, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { listarReglasCorreoActivas, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { uid } from "@/lib/helpers";
import { construirVariables, ejecutarAccionReglaCorreo } from "./reglas";
import type { ResultadoEnvioMasivoCorreo } from "@/types";

/**
 * Campaña de invitación a migrar de WooCommerce Subscriptions (sistema
 * anterior) al Oneclick propio de esta app — mismo propósito puntual que
 * "Web Settings → Mensajes Únicos" para WhatsApp (ver
 * @/lib/whatsapp/masivo), pero con el grupo de destinatarios fijo (no
 * elegido a mano): todo cliente con `renovacionAutoWooDesde` seteado (ver
 * RenovacionLegacyCard.tsx) y email registrado. No se puede migrar por
 * atrás: Transbank Oneclick exige que el cliente reinscriba su tarjeta él
 * mismo (ver cancelarSuscripcionWooCommerceLegacy.ts), así que esto solo
 * invita — el cliente hace el resto desde Mi Cuenta.
 *
 * Reusa el motor de ReglaCorreo/PlantillaCorreo (tipoEvento
 * "migracion_woo_legacy") en vez de tener su propio contenido hardcodeado,
 * para que el admin pueda editar el texto de la invitación desde Web
 * Settings → Mail Templates sin tocar código. Idempotente vía la misma tabla
 * disparos_regla_correo (origenTipo "cliente", origenId = clienteId): un
 * cliente ya invitado no vuelve a recibir el correo si se aprieta el botón
 * de nuevo — solo alcanza a los que falten.
 */
export async function enviarInvitacionesMigracionWoo(): Promise<ResultadoEnvioMasivoCorreo> {
  const vacio: ResultadoEnvioMasivoCorreo = { total: 0, enviados: 0, fallidos: 0, sinEmail: 0 };

  const reglas = await listarReglasCorreoActivas("migracion_woo_legacy");
  if (!reglas.length) {
    console.error('No hay ninguna ReglaCorreo activa de tipoEvento "migracion_woo_legacy" — crea una en Web Settings → Reglas Correo');
    return vacio;
  }

  const rows = await getDb()
    .select()
    .from(clientes)
    .where(and(isNotNull(clientes.renovacionAutoWooDesde)));

  const resultado: ResultadoEnvioMasivoCorreo = { total: rows.length, enviados: 0, fallidos: 0, sinEmail: 0 };

  for (const row of rows) {
    const cliente = clienteFromRow(row);
    if (!cliente.email) {
      resultado.sinEmail++;
      continue;
    }
    for (const regla of reglas) {
      const disparo = await registrarDisparoReglaCorreo({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: cliente.id,
        clienteId: cliente.id,
        patente: cliente.patente,
        estado: "programado",
        enviarEn: new Date().toISOString(),
      });
      if (!disparo) continue; // ya se invitó a este cliente con esta regla

      const variables = construirVariables({ cliente });
      const ok = await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables).catch((error) => {
        console.error(`Error enviando invitación de migración Woo a ${cliente.id}`, error);
        return false;
      });
      if (ok) resultado.enviados++;
      else resultado.fallidos++;
    }
  }

  return resultado;
}
