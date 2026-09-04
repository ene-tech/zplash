import "server-only";

import { limpiarEmailCliente } from "@/lib/dataAccess/clientes";
import { eliminarDisparoReglaCorreo, marcarDisparoReglaCorreo, obtenerPlantillaCorreo } from "@/lib/dataAccess/mail";
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
  // Igual que en el motor de WhatsApp: este es el único punto por el que
  // pasan todas las salidas automáticas de correo (cron de vencimientos,
  // disparadores por venta, envío masivo de Correos Únicos y la campaña de
  // migración Woo), así que el opt-out del cliente se respeta acá una sola
  // vez. Ver sinComunicacionAuto en @/db/schema/clientes.
  if (cliente.sinComunicacionAuto) {
    await marcarDisparoReglaCorreo(disparoId, { estado: "error", error: "cliente sin comunicación automática" });
    return false;
  }
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
  // el diseño de marca (logo, acento dorado, footer), convierte los párrafos
  // a HTML y recién ahí aplica las {{variables}} (nombre/patente/
  // fechaVencimiento en negrita) — así el contenido queda editable sin
  // HTML/CSS a mano y el correo se ve profesional igual.
  const html = envolverCorreoBase(plantilla.cuerpo, variables);
  const resultado = await enviarCorreoTransaccional({
    to: cliente.email,
    subject: asunto,
    html,
    disparoId,
    clienteId: cliente.id,
  });

  // Dirección irrecuperable (malformada, o rechazada de plano por el
  // proveedor): se le borra el email al cliente para que la ficha del operador
  // vuelva a pedirlo en su próximo lavado (ver limpiarEmailCliente). Solo con
  // `permanente`: un límite de envío o una caída del proveedor NO borran nada.
  if (!resultado.ok && resultado.permanente) {
    const limpiado = await limpiarEmailCliente(cliente.id, cliente.email, resultado.error || "correo rechazado");
    // Con el email ya borrado se borra también el disparo, en vez de marcarlo
    // "error". Si quedara, el unique (regla_id, origen_tipo, origen_id)
    // dejaría a este cliente fuera de cualquier reenvío durante todo el ciclo
    // de plan — justo cuando el operador acaba de capturarle la dirección
    // buena, que es el punto de todo esto. La falla no se pierde: quedó en la
    // bandeja de salida (con la dirección mala) y en la auditoría del cliente.
    //
    // Si el borrado del email falló, en cambio, el disparo se queda: la
    // dirección mala sigue en la ficha, así que la fila es lo único que evita
    // que el cron le reintente el mismo correo todos los días de acá al
    // vencimiento, sumando rebotes contra la reputación del remitente.
    if (limpiado) {
      await eliminarDisparoReglaCorreo(disparoId);
      return false;
    }
  }

  await marcarDisparoReglaCorreo(disparoId, { estado: resultado.ok ? "enviado" : "error", error: resultado.error });
  return resultado.ok;
}
