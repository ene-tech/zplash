import "server-only";

import { getClientesByIds, obtenerPlantillaWhatsapp, upsertCupones } from "@/lib/dataAccess";
import { isValidTelefono, montoDescuento } from "@/lib/helpers";
import type { AccionReglaWhatsapp, Cupon, ResultadoEnvioMasivoWhatsapp } from "@/types";
import { construirVariables, crearCuponDescuento, enviarSegunPlantilla, generarCodigosCuponUnicos } from "./reglas";

// Envío manual a un grupo de clientes elegido a mano en el momento (Web
// Settings → Mensajes Únicos), para situaciones puntuales que no ameritan una
// ReglaWhatsapp permanente (aviso de cierre por mantención, oferta especial
// para vencidos que no han renovado, etc.). Reutiliza el mismo catálogo de
// PlantillaWhatsapp/enviarSegunPlantilla que el motor de reglas: exige
// plantilla.metaNombre (template aprobado en Meta) porque estos clientes
// probablemente no escribieron en las últimas 24h, así que un mensaje de
// texto libre sería rechazado por la Graph API.
//
// `accion` sigue el mismo contrato que ReglaWhatsapp.accion (Web Settings →
// Reglas WhatsApp): con "cupon_descuento" se genera un Cupon real por cada
// cliente con teléfono, atado a su patente (reconocible sin código al volver,
// ver OperadorFoundResult) — mismos campos cuponEsPorcentaje/cuponValor/
// cuponValidezDias, y montoOferta del template se deriva del cupón igual que
// en ejecutarAccionRegla (queda por compatibilidad con plantillas viejas).
// `precioBase` es opcional y solo sirve para calcular montoDescuento/
// montoAPagar (ver comentario en PlantillaWhatsapp.metaVariables) — sin él,
// solo montoOferta queda disponible para la plantilla, igual que antes de que
// existieran esas dos variables. Con "mensaje_simple" (default, y único
// comportamiento antes de que existiera `accion`) no hay Cupon detrás:
// montoOferta/diasValidez son constantes de texto libre que el admin llena a
// mano solo si la plantilla elegida los usa.
export async function enviarMensajesMasivosWhatsapp(opts: {
  plantillaId: string;
  clienteIds: string[];
  accion?: AccionReglaWhatsapp;
  cuponEsPorcentaje?: boolean;
  cuponValor?: number;
  cuponValidezDias?: number;
  precioBase?: number;
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
  const enviadoPor = opts.enviadoPor || "mensajes-masivos";

  // Cupones (si corresponde) se generan y guardan en un solo lote antes de
  // enviar, no uno a uno dentro del loop de envío: evita una consulta a la
  // tabla cupones por cliente y deja los cupones creados aunque algún envío
  // individual falle después.
  // isValidTelefono descarta el placeholder "+569" que queda guardado tal
  // cual cuando un operador guarda sin completar los 8 dígitos (ver
  // OperadorFoundResult/ClientModal) — es un string truthy que superaba este
  // filtro sin más, la Graph API lo rechazaba uno por uno con "(#131009)
  // Parameter value is not valid" y esos clientes quedaban contados como
  // "fallido" en vez de "sinTelefono".
  const conTelefono = clientesEncontrados.filter((c) => c.telefono && isValidTelefono(c.telefono));
  const generaCupon = opts.accion === "cupon_descuento" && !!opts.cuponValor;
  const cuponPorClienteId = new Map<string, Cupon>();
  if (generaCupon) {
    const diasValidez = opts.cuponValidezDias ?? 7;
    const codigos = await generarCodigosCuponUnicos(conTelefono.length);
    const nuevosCupones = conTelefono.map((cliente, i) =>
      crearCuponDescuento({
        // Id explícito con el índice del loop — ver comentario en
        // crearCuponDescuento (@/lib/whatsapp/reglas/motor.ts) sobre por qué
        // uid() solo no basta para un lote de cientos generado en el mismo tick.
        id: `c${Date.now()}${i}${Math.floor(Math.random() * 1000)}`,
        codigo: codigos[i],
        patente: cliente.patente,
        valor: opts.cuponValor || 0,
        esPorcentaje: opts.cuponEsPorcentaje || false,
        validezDias: diasValidez,
        nombreLote: `WhatsApp masivo - ${plantilla.nombre}`,
        creadoPor: enviadoPor,
      })
    );
    const cuponesGuardados = await upsertCupones(nuevosCupones);
    // Si upsertCupones falla (ver "Error guardando cupones" en dataAccess),
    // no hay que enviar igual: el mensaje de esta plantilla promete un
    // "descuento automático" atado a la patente (ver comentario del módulo)
    // y sin el cupón real guardado esa promesa queda rota para todo el lote —
    // visto en producción: 0 cupones guardados por una colisión de id, pero
    // igual se mandaron ~250 WhatsApp antes de que la función se cortara por
    // timeout. Mejor no mandar nada de este lote que mandar de más.
    if (!cuponesGuardados) {
      console.error(`Envío masivo WhatsApp: no se pudieron guardar los ${nuevosCupones.length} cupones del lote, no se envía ningún mensaje`);
      return { total: clientesEncontrados.length, enviados: 0, fallidos: clientesEncontrados.length, sinTelefono: 0, cuponError: true };
    }
    nuevosCupones.forEach((c, i) => cuponPorClienteId.set(conTelefono[i].id, c));
  }

  for (const cliente of clientesEncontrados) {
    if (!cliente.telefono || !isValidTelefono(cliente.telefono)) {
      resultado.sinTelefono++;
      continue;
    }
    const cupon = cuponPorClienteId.get(cliente.id);
    // montoDescuento/montoAPagar solo se calculan si hay precioBase: para un
    // cupón de porcentaje sin precio de referencia no hay forma de saber
    // cuántos pesos representa. Sin precioBase, montoOferta (crudo, sin
    // ajustar) sigue siendo la única variable disponible — mismo
    // comportamiento que antes de que existiera este campo.
    const montoDescuentoPesos = cupon && opts.precioBase !== undefined ? montoDescuento(cupon, opts.precioBase) : undefined;
    const montoAPagarPesos =
      montoDescuentoPesos !== undefined && opts.precioBase !== undefined
        ? Math.max(0, opts.precioBase - montoDescuentoPesos)
        : undefined;
    const variables = construirVariables({
      cliente,
      montoOferta: cupon ? cupon.valor : opts.montoOferta,
      montoDescuento: montoDescuentoPesos,
      montoAPagar: montoAPagarPesos,
      diasValidez: cupon ? opts.cuponValidezDias ?? 7 : opts.diasValidez,
    });
    const mensaje = await enviarSegunPlantilla(plantilla, cliente.telefono, variables, enviadoPor).catch((error) => {
      console.error(`Error en envío masivo de WhatsApp a cliente ${cliente.id}`, error);
      return null;
    });
    if (mensaje?.estado === "enviado") resultado.enviados++;
    else resultado.fallidos++;
  }

  return resultado;
}
