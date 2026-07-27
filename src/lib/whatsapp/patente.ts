import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { aplicarVariables, fmtFecha, isValidPatente, normPlate, planStatus } from "@/lib/helpers";
import {
  actualizarFlowStateConversacion,
  actualizarPatentePendiente,
  buscarClientePorPatente,
  getClientesByIds,
  vincularClienteConversacion,
} from "@/lib/dataAccess";
import type { ConversacionWhatsapp, TextosBotWhatsapp } from "@/types";
import type { RespuestaBot } from "./router";

// Consulta de estado de plan por patente (ver responderMensaje en
// @/lib/whatsapp/router) y el flujo de "cambio de patente" que se ofrece al
// final de una consulta exitosa.
export async function estadoPlanPorPatente(
  patenteCruda: string,
  textos: TextosBotWhatsapp,
  telefono: string,
  conversacion: ConversacionWhatsapp
): Promise<RespuestaBot> {
  const patente = normPlate(patenteCruda);
  const db = getDb();
  const [cliente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);

  // No entregamos datos del cliente si el teléfono que escribe no es el
  // registrado para esa patente, para no filtrar información a un número
  // ajeno (mismo mensaje que "no encontrada" para no confirmar que la
  // patente existe).
  if (!cliente || cliente.telefono !== telefono) return { texto: textos.patenteNoEncontrada };

  // Enlaza (o re-enlaza, si el teléfono tiene más de un vehículo) la
  // conversación a este Cliente: es lo que después habilita la Opción
  // "cambio de patente" (ver iniciarCambioPatente) a saber sobre cuál
  // registro operar sin volver a pedir la patente actual.
  if (conversacion.clienteId !== cliente.id) await vincularClienteConversacion(conversacion.id, cliente.id);

  const estado = planStatus(cliente);
  const plan = cliente.plan || textos.patenteEstadoPlanVacio;
  const lineas = [
    aplicarVariables(textos.patenteEstadoEncabezado, { patente: cliente.patente, nombre: cliente.nombre }),
    aplicarVariables(textos.patenteEstadoPlan, { plan }),
    aplicarVariables(textos.patenteEstadoLinea, { estado: estado.label }),
  ];
  if (cliente.vencimiento) lineas.push(aplicarVariables(textos.patenteEstadoVencimiento, { fecha: fmtFecha(cliente.vencimiento) }));
  if (estado.cls === "warn" && estado.diasRestantes !== undefined) {
    lineas.push(aplicarVariables(textos.patenteEstadoAvisoPorVencer, { dias: String(estado.diasRestantes) }));
  }
  if (estado.cls === "bad") {
    lineas.push(``, textos.patenteEstadoAvisoVencido);
  }
  lineas.push(``, textos.patenteEstadoCambioInvitacion);
  return { texto: lineas.join("\n") };
}

// Punto de entrada de "cambio de patente" (ver patenteEstadoCambioInvitacion):
// solo disponible una vez que estadoPlanPorPatente ya enlazó la conversación
// a un Cliente real, así que acá no hace falta re-pedir/re-validar la
// patente actual.
export async function iniciarCambioPatente(conversacion: ConversacionWhatsapp, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  if (!conversacion.clienteId) return { texto: textos.textoCambioPatenteSinCliente };
  await actualizarFlowStateConversacion(conversacion.id, { tipo: "cambio_patente", paso: "nueva_patente" });
  return { texto: textos.textoCambioPatentePedirNueva };
}

// Mismo mecanismo diferido que solicitarCambioPatente (@/lib/db/clientes):
// deja la patente nueva en patentePendiente, no reemplaza `patente` al
// toque — recién se aplica cuando el plan renueva a un período nuevo (ver
// resolverPatentePendiente en @/lib/helpers). Se llama directo a
// dataAccess, no al Server Action homónimo, por el mismo motivo que el
// resto del bot (sin sesión de perfil dentro del webhook de Meta) — las
// validaciones de sesión/módulo de solicitarCambioPatente no aplican acá
// porque quien pide el cambio es el propio dueño del número.
export async function manejarPasoCambioPatente(texto: string, conversacion: ConversacionWhatsapp, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  const clienteId = conversacion.clienteId;
  if (!clienteId) {
    await actualizarFlowStateConversacion(conversacion.id, null);
    return { texto: textos.textoCambioPatenteSinCliente };
  }

  const patente = normPlate(texto);
  if (!isValidPatente(patente)) return { texto: textos.textoCambioPatenteInvalida };

  const [actual] = await getClientesByIds([clienteId]);
  if (!actual) {
    await actualizarFlowStateConversacion(conversacion.id, null);
    return { texto: textos.textoCambioPatenteSinCliente };
  }
  if (normPlate(actual.patente) === patente) return { texto: textos.textoCambioPatenteEsLaMisma };

  const otro = await buscarClientePorPatente(patente);
  if (otro && otro.id !== clienteId) return { texto: textos.textoCambioPatenteYaExiste };

  await actualizarPatentePendiente(clienteId, patente);
  await actualizarFlowStateConversacion(conversacion.id, null);
  return { texto: aplicarVariables(textos.textoCambioPatenteConfirmacion, { patente }) };
}
