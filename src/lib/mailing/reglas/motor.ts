import "server-only";

import { marcarDisparoReglaCorreo, obtenerPlantillaCorreo } from "@/lib/dataAccess/mail";
import { aplicarVariables } from "@/lib/helpers";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
// Reusa el mismo lookup de Cliente y el mismo builder de variables
// ({{nombre}}, {{patente}}, {{plan}}, {{monto}}, {{fechaVencimiento}}, etc.)
// que ya usa el motor de reglas de WhatsApp — mismo Cliente, mismo contrato
// de variables (ver @/lib/whatsapp/reglas/motor.ts), no hay motivo para
// duplicarlos solo porque el canal de salida es distinto.
export { buscarCliente, construirVariables, MS_POR_DIA } from "@/lib/whatsapp/reglas";
import type { Cliente, ReglaCorreo } from "@/types";

/**
 * Ejecuta la acción de una ReglaCorreo ya disparada (fila en
 * disparos_regla_correo ya insertada, para idempotencia) contra un cliente
 * concreto: arma asunto/cuerpo desde su PlantillaCorreo aplicando
 * `variables`, envía por Resend (@/lib/mailing/proveedor) y marca el
 * resultado. Mismo shape que ejecutarAccionRegla de WhatsApp, sin cupón/push
 * (esta v1 de correo no los tiene). Retorna si el envío quedó "enviado" —
 * usado por enviarInvitacionesMigracionWoo (@/lib/mailing/migracionWoo) para
 * contar enviados/fallidos; disparadores.ts/cron.ts lo ignoran (el resultado
 * real ya queda en disparos_regla_correo).
 */
export async function ejecutarAccionReglaCorreo(
  regla: ReglaCorreo,
  disparoId: string,
  cliente: Cliente,
  variables: Record<string, string>
): Promise<boolean> {
  if (!cliente.email) {
    console.error(`Regla de correo "${regla.nombre}": cliente ${cliente.id} sin email, no se puede enviar`);
    await marcarDisparoReglaCorreo(disparoId, { estado: "error", error: "cliente sin email" });
    return false;
  }
  const plantilla = await obtenerPlantillaCorreo(regla.plantillaCorreoId);
  if (!plantilla || !plantilla.activo) {
    console.error(`Regla de correo "${regla.nombre}": plantilla ${regla.plantillaCorreoId} no existe o está inactiva`);
    await marcarDisparoReglaCorreo(disparoId, { estado: "error", error: "plantilla no disponible" });
    return false;
  }

  const asunto = aplicarVariables(plantilla.asunto, variables);
  // El admin escribe texto plano en Web Settings → Mail Templates (ver
  // WebSettingsMailTab.tsx, un <textarea> simple); envolverCorreoBase le pone
  // el diseño de marca (logo, acento dorado, footer) y convierte los
  // párrafos a HTML — así el contenido queda editable sin HTML/CSS a mano y
  // el correo se ve profesional igual.
  const cuerpo = aplicarVariables(plantilla.cuerpo, variables);
  const html = envolverCorreoBase(cuerpo);
  const resultado = await enviarCorreoTransaccional({ to: cliente.email, subject: asunto, html });
  await marcarDisparoReglaCorreo(disparoId, { estado: resultado.ok ? "enviado" : "error", error: resultado.error });
  return resultado.ok;
}
