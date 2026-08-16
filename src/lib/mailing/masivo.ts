import "server-only";

import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { obtenerOCrearReglaEnvioManual, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { uid } from "@/lib/helpers";
import { construirVariables, ejecutarAccionReglaCorreo } from "./reglas";
import type { ResultadoEnvioMasivoCorreo } from "@/types";

/**
 * Envío puntual de una PlantillaCorreo a un grupo de clientes elegido a mano
 * en el momento (Web Settings → Correos Únicos) — el equivalente por correo de
 * enviarMensajesMasivosWhatsapp (@/lib/whatsapp/masivo), para situaciones que
 * no ameritan una ReglaCorreo permanente o para alcanzar a quienes quedaron
 * fuera de una: el cron de "plan_vencido" solo mira DIAS_VENTANA_PLAN_VENCIDO
 * días hacia atrás (ver @/lib/mailing/reglas/cron), así que un backlog más
 * viejo que esa ventana no lo cubre ninguna regla.
 *
 * A diferencia de WhatsApp no hay catálogo externo que aprobar (nada de
 * metaNombre): basta con que la PlantillaCorreo esté activa. Reusa el motor de
 * ReglaCorreo colgándose de una regla "percha" por plantilla (ver
 * obtenerOCrearReglaEnvioManual), igual que enviarInvitacionesMigracionWoo,
 * para escribir en disparos_regla_correo y aparecer en Historial Correo como
 * cualquier otro envío.
 *
 * Idempotencia: origenId = `${clienteId}:${vencimiento}`, mismo criterio que
 * plan_vencido/plan_proximo_vencer. O sea, una vez por cliente por ciclo de
 * plan — reintentar el mismo envío tras un corte a mitad de camino no
 * redispara a quien ya lo recibió, y un cliente que renueva y vuelve a caer en
 * el mismo problema el ciclo siguiente sí vuelve a ser elegible.
 *
 * El cliente sin plan no tiene vencimiento y por lo tanto tampoco tiene ciclo:
 * ahí la llave cae al día del envío. Con el `null` crudo la llave era
 * constante para siempre y esa plantilla no le podía volver a llegar NUNCA
 * (quedaba silenciosamente en `omitidos`) — justo a los clientes sin plan, que
 * son el público natural de una campaña de reactivación. Por día conserva lo
 * que importa, que es no duplicar dentro de la misma tanda ni en su reintento.
 */
export async function enviarCorreosMasivos(opts: {
  plantillaCorreoId: string;
  clienteIds: string[];
  enviadoPor?: string;
}): Promise<ResultadoEnvioMasivoCorreo> {
  const vacio: ResultadoEnvioMasivoCorreo = { total: 0, enviados: 0, fallidos: 0, sinEmail: 0, omitidos: 0 };
  if (!opts.clienteIds.length) return vacio;

  const clientes = await getClientesByIds(opts.clienteIds);
  const regla = await obtenerOCrearReglaEnvioManual(opts.plantillaCorreoId, opts.enviadoPor);
  if (!regla) {
    console.error(`Envío masivo de correo: no se pudo resolver la regla percha de la plantilla ${opts.plantillaCorreoId}`);
    return { total: clientes.length, enviados: 0, fallidos: clientes.length, sinEmail: 0, omitidos: 0 };
  }

  // `omitidos` es opcional en el tipo (la campaña de migración Woo no lo
  // reporta), pero acá siempre se cuenta — de ahí el required local.
  const resultado: ResultadoEnvioMasivoCorreo & { omitidos: number } = {
    total: clientes.length,
    enviados: 0,
    fallidos: 0,
    sinEmail: 0,
    omitidos: 0,
  };
  const ahoraISO = new Date().toISOString();
  const diaEnvio = ahoraISO.slice(0, 10);

  for (const cliente of clientes) {
    if (!cliente.email) {
      resultado.sinEmail++;
      continue;
    }

    const disparo = await registrarDisparoReglaCorreo({
      id: uid(),
      reglaId: regla.id,
      origenTipo: "cliente",
      origenId: `${cliente.id}:${cliente.vencimiento || `sin-plan-${diaEnvio}`}`,
      clienteId: cliente.id,
      patente: cliente.patente,
      estado: "programado",
      enviarEn: ahoraISO,
    });
    if (!disparo) {
      // Ya recibió esta plantilla en este ciclo de vencimiento. Se cuenta
      // aparte en vez de sumarse a "enviados": si el admin reenvía sobre el
      // mismo filtro tiene que ver que no se mandó nada nuevo.
      resultado.omitidos++;
      continue;
    }

    const variables = construirVariables({ cliente });
    const ok = await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables).catch((error) => {
      console.error(`Error enviando correo masivo a ${cliente.id}`, error);
      return false;
    });
    if (ok) resultado.enviados++;
    else resultado.fallidos++;
  }

  return resultado;
}
