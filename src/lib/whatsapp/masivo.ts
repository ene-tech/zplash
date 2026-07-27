import "server-only";

import { getClientesByIds, obtenerPlantillaWhatsapp } from "@/lib/dataAccess";
import type { ResultadoEnvioMasivoWhatsapp } from "@/types";
import { construirVariables, enviarSegunPlantilla } from "./reglas";

// Envío manual a un grupo de clientes elegido a mano en el momento (Web
// Settings → Mensajes Únicos), para situaciones puntuales que no ameritan una
// ReglaWhatsapp permanente (aviso de cierre por mantención, oferta especial
// para vencidos que no han renovado, etc.). Reutiliza el mismo catálogo de
// PlantillaWhatsapp/enviarSegunPlantilla que el motor de reglas: exige
// plantilla.metaNombre (template aprobado en Meta) porque estos clientes
// probablemente no escribieron en las últimas 24h, así que un mensaje de
// texto libre sería rechazado por la Graph API. `montoOferta`/`diasValidez`
// son constantes para todo el envío (no hay Cupon real detrás, a diferencia
// de accion="cupon_descuento" de las reglas) — el admin los llena a mano solo
// si la plantilla elegida los usa.
export async function enviarMensajesMasivosWhatsapp(opts: {
  plantillaId: string;
  clienteIds: string[];
  montoOferta?: number;
  diasValidez?: number;
  enviadoPor?: string;
}): Promise<ResultadoEnvioMasivoWhatsapp> {
  const vacio: ResultadoEnvioMasivoWhatsapp = { total: 0, enviados: 0, fallidos: 0, sinTelefono: 0 };
  if (!opts.clienteIds.length) return vacio;

  const plantilla = await obtenerPlantillaWhatsapp(opts.plantillaId);
  const clientesEncontrados = await getClientesByIds(opts.clienteIds);
  if (!plantilla?.metaNombre) {
    console.error(`Envío masivo WhatsApp: plantilla ${opts.plantillaId} no existe o no tiene metaNombre configurado`);
    return { total: clientesEncontrados.length, enviados: 0, fallidos: clientesEncontrados.length, sinTelefono: 0 };
  }

  const resultado: ResultadoEnvioMasivoWhatsapp = { total: clientesEncontrados.length, enviados: 0, fallidos: 0, sinTelefono: 0 };

  for (const cliente of clientesEncontrados) {
    if (!cliente.telefono) {
      resultado.sinTelefono++;
      continue;
    }
    const variables = construirVariables({ cliente, montoOferta: opts.montoOferta, diasValidez: opts.diasValidez });
    const mensaje = await enviarSegunPlantilla(plantilla, cliente.telefono, variables, opts.enviadoPor || "mensajes-masivos").catch(
      (error) => {
        console.error(`Error en envío masivo de WhatsApp a cliente ${cliente.id}`, error);
        return null;
      }
    );
    if (mensaje?.estado === "enviado") resultado.enviados++;
    else resultado.fallidos++;
  }

  return resultado;
}
