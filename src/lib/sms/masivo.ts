import "server-only";

import { clienteIdsConSmsDeCampana, getClientesByIds, getConfig } from "@/lib/dataAccess";
import { aplicarVariables } from "@/lib/helpers";
import { generarCuponesMasivos, variablesEnvioMasivo, type OpcionesOfertaMasivo } from "@/lib/whatsapp/masivo";
import type { ResultadoEnvioMasivoSms } from "@/types";
import { enviarSms, msisdnChile } from "./enviar";
import { segmentosSms, textoFinalSms } from "./texto";

/**
 * Envío masivo de un SMS de campaña: canal paralelo a WhatsApp, para
 * campañas donde la respuesta del cliente no importa y el template MARKETING
 * de Meta sale caro. A diferencia de WhatsApp, el texto es libre (no pasa por
 * aprobación) y usa las mismas variables {{nombre}}, {{patente}},
 * {{montoOferta}}, {{fechaVencimientoOferta}}, etc. que las plantillas (ver
 * construirVariables), con los mismos cupones por patente que el masivo de
 * WhatsApp (ver generarCuponesMasivos).
 *
 * Lo usan Web Settings → Mensajes Únicos (canal SMS) y los scripts de campaña:
 *   const r = await enviarMensajesMasivosSms({ campana: "primavera-2026-sms", texto, clienteIds, enviadoPor: "script" });
 *
 * `campana` es obligatoria: agrupa el envío para medirlo en mensajes_sms y
 * hace que reintentar no le mande dos veces lo mismo a nadie. A diferencia del
 * masivo de WhatsApp, respeta sinComunicacionAuto: el link de baja de cada SMS
 * marca justamente esa opción.
 */
export async function enviarMensajesMasivosSms(
  opts: OpcionesOfertaMasivo & {
    campana: string;
    texto: string;
    clienteIds: string[];
    enviadoPor?: string;
  }
): Promise<ResultadoEnvioMasivoSms> {
  const resultado: ResultadoEnvioMasivoSms = { total: 0, enviados: 0, fallidos: 0, sinTelefono: 0, omitidos: 0, repetidos: 0, segmentos: 0 };
  const campana = opts.campana.trim();
  if (!opts.clienteIds.length || !campana || !opts.texto.trim()) return resultado;

  const clientesEncontrados = await getClientesByIds(opts.clienteIds);
  resultado.total = clientesEncontrados.length;
  const yaEnviados = new Set(await clienteIdsConSmsDeCampana(campana, clientesEncontrados.map((c) => c.id)));
  const enviadoPor = opts.enviadoPor || "mensajes-masivos-sms";

  const destinatarios = clientesEncontrados.filter((c) => {
    if (!c.telefono || !msisdnChile(c.telefono)) {
      resultado.sinTelefono++;
      return false;
    }
    if (c.sinComunicacionAuto) {
      resultado.omitidos++;
      return false;
    }
    if (yaEnviados.has(c.id)) {
      resultado.repetidos++;
      return false;
    }
    return true;
  });
  if (!destinatarios.length) return resultado;

  const cuponPorClienteId = await generarCuponesMasivos(destinatarios, opts, `SMS masivo - ${campana}`, enviadoPor);
  if (!cuponPorClienteId) return { ...resultado, fallidos: destinatarios.length, cuponError: true };

  const descuentoReferido = /\{\{descuentoReferido\}\}/.test(opts.texto) ? (await getConfig()).descuentoReferidoValor : undefined;

  for (const cliente of destinatarios) {
    const variables = variablesEnvioMasivo(cliente, cuponPorClienteId.get(cliente.id), opts, descuentoReferido);
    const texto = aplicarVariables(opts.texto, variables);
    const r = await enviarSms({ telefono: cliente.telefono!, texto, campana, clienteId: cliente.id, enviadoPor }).catch((error) => {
      console.error(`Error en envío masivo de SMS a cliente ${cliente.id}`, error);
      return { ok: false, error: "Error inesperado" };
    });
    if (r.ok) {
      resultado.enviados++;
      // Mismo cálculo que enviarSms; el código de baja tiene largo fijo, así
      // que cualquier código da el mismo conteo.
      resultado.segmentos += segmentosSms(textoFinalSms(texto, "XXXXXX"));
    } else {
      resultado.fallidos++;
      resultado.primerError ??= r.error;
    }
  }
  return resultado;
}
