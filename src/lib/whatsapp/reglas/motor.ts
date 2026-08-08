import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones as cuponesTabla } from "@/db/schema";
// Import directo a los submódulos de dataAccess (no al barrel @/lib/dataAccess)
// para no crear un ciclo con dataAccess/ventas.ts, que llama a
// evaluarReglasPorVenta (ver @/lib/whatsapp/reglas/disparadores) e importa
// este archivo transitivamente.
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { upsertCupones } from "@/lib/dataAccess/cupones";
import { marcarDisparoReglaWhatsapp, obtenerPlantillaWhatsapp } from "@/lib/dataAccess/whatsapp";
import { aplicarVariables, fmtCLP, fmtFecha, generarCodigoCupon, uid } from "@/lib/helpers";
import { enviarPush } from "@/lib/push/enviar";
import { enviarMensajePlantilla } from "../enviar";
import type { Cliente, Cupon, PlantillaWhatsapp, ReglaWhatsapp } from "@/types";

export const MS_POR_DIA = 86_400_000;

export async function buscarCliente(clienteId: string): Promise<Cliente | null> {
  const [row] = await getDb().select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  return row ? clienteFromRow(row) : null;
}

// Exportada para que enviarMensajesMasivosWhatsapp (@/lib/whatsapp/masivo,
// Web Settings → Mensajes Únicos) arme las mismas variables que el motor de
// reglas a partir de un Cliente, sin duplicar esta lógica.
// `montoOferta` queda por compatibilidad con plantillas ya escritas antes de
// que existieran `montoDescuento`/`montoAPagar` — con accion="cupon_descuento"
// las tres reciben el mismo cuponValor, pero montoOferta NO se ajusta por
// precioBase cuando el cupón es de porcentaje (a diferencia de
// montoDescuento/montoAPagar), así que las plantillas nuevas deberían preferir
// estas dos: sin ambigüedad sobre si el número que ve el cliente es lo que se
// descuenta o lo que queda por pagar.
// `fechaVencimiento` es SIEMPRE el vencimiento del plan del cliente (o vacío
// si no tiene uno) — no confundir con `fechaVencimientoOferta`, la fecha
// hasta la que vale el descuento/oferta del mensaje mismo (hoy + diasValidez).
// Son conceptos distintos: un cliente sin plan (ej. "clientes sin plan") no
// tiene fechaVencimiento pero sí puede tener una oferta con fecha límite
// propia — usar fechaVencimiento ahí manda un parámetro vacío y la Graph API
// rechaza el envío completo (error 131008/131009).
export function construirVariables(opts: {
  cliente: Cliente;
  monto?: number;
  montoOferta?: number;
  montoDescuento?: number;
  montoAPagar?: number;
  diasValidez?: number;
  patenteAnterior?: string;
}): Record<string, string> {
  return {
    nombre: opts.cliente.nombre || "",
    patente: opts.cliente.patente || "",
    plan: opts.cliente.plan || "",
    monto: opts.monto !== undefined ? fmtCLP(opts.monto) : "",
    fechaVencimiento: opts.cliente.vencimiento ? fmtFecha(opts.cliente.vencimiento) : "",
    fechaVencimientoOferta: opts.diasValidez !== undefined ? fmtFecha(new Date(Date.now() + opts.diasValidez * MS_POR_DIA).toISOString()) : "",
    montoOferta: opts.montoOferta !== undefined ? fmtCLP(opts.montoOferta) : "",
    montoDescuento: opts.montoDescuento !== undefined ? fmtCLP(opts.montoDescuento) : "",
    montoAPagar: opts.montoAPagar !== undefined ? fmtCLP(opts.montoAPagar) : "",
    diasValidez: opts.diasValidez !== undefined ? String(opts.diasValidez) : "",
    patenteAnterior: opts.patenteAnterior || "",
  };
}

// Arma el preview (aplicarVariables sobre plantilla.mensaje, informativo en
// logs si algo falla) y el envío real vía enviarMensajePlantilla, que exige
// metaNombre — sin eso la plantilla sigue siendo solo un borrador de
// contenido (ver comentario en @/db/schema/whatsapp) y no hay a qué template
// aprobado de Meta mandarle el mensaje. Exportada (con `enviadoPor`
// configurable, antes fijo en "regla-whatsapp") para que
// enviarMensajesMasivosWhatsapp (@/lib/whatsapp/masivo) la reutilice sin
// duplicar el manejo de metaVariables/parámetros posicionales, dejando su
// propio remitente en el registro del mensaje.
export async function enviarSegunPlantilla(
  plantilla: PlantillaWhatsapp,
  telefono: string,
  variables: Record<string, string>,
  enviadoPor = "regla-whatsapp"
) {
  if (!plantilla.metaNombre) {
    console.error(`Plantilla WhatsApp "${plantilla.nombre}" no tiene metaNombre configurado (Web Settings → WhatsApp Plantillas); no se puede enviar`);
    return null;
  }
  // metaVariables se guarda en minúsculas (ver auto-rellenado en
  // WebSettingsWhatsappTab), pero las claves de `variables` son camelCase
  // (fechaVencimiento, montoOferta) — match insensible a mayúsculas para que
  // el admin no tenga que escribir el camelCase exacto a mano.
  const porClaveMinuscula = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k.toLowerCase(), v]));
  const parametros = (plantilla.metaVariables || []).map((v) => porClaveMinuscula[v.toLowerCase()] ?? "");
  return enviarMensajePlantilla(telefono, plantilla.metaNombre, plantilla.metaIdioma || "es", parametros, enviadoPor);
}

// Batch: una sola consulta de códigos existentes para generar `cantidad`
// códigos únicos de una vez (en vez de una consulta completa a la tabla
// cupones por cada código) — usado tanto por ejecutarAccionRegla (cantidad=1)
// como por enviarMensajesMasivosWhatsapp (@/lib/whatsapp/masivo), que genera
// un cupón por cliente en un solo envío masivo.
export async function generarCodigosCuponUnicos(cantidad: number): Promise<string[]> {
  if (!cantidad) return [];
  const existentes = await getDb().select({ codigo: cuponesTabla.codigo }).from(cuponesTabla);
  const usados = new Set(existentes.map((r) => r.codigo));
  const codigos: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const codigo = generarCodigoCupon(usados);
    usados.add(codigo);
    codigos.push(codigo);
  }
  return codigos;
}

// Arma un Cupon "descuento" atado a una patente (reconocible sin código al
// volver, ver OperadorFoundResult) — misma forma que arma ejecutarAccionRegla
// para las ReglaWhatsapp, extraída para que enviarMensajesMasivosWhatsapp
// (@/lib/whatsapp/masivo, Web Settings → Mensajes Únicos) pueda generar un
// cupón real por cliente en un envío masivo sin duplicar la forma del objeto.
export function crearCuponDescuento(opts: {
  codigo: string;
  patente: string;
  valor: number;
  esPorcentaje: boolean;
  validezDias: number;
  nombreLote: string;
  creadoPor: string;
}): Cupon {
  const ahora = new Date();
  return {
    id: uid(),
    codigo: opts.codigo,
    nombreLote: opts.nombreLote,
    valor: opts.valor,
    numeroLote: 1,
    totalLote: 1,
    fechaCaducidad: new Date(ahora.getTime() + opts.validezDias * MS_POR_DIA).toISOString(),
    usado: false,
    creadoEn: ahora.toISOString(),
    creadoPor: opts.creadoPor,
    tipo: "descuento",
    patenteAsignada: opts.patente,
    esPorcentaje: opts.esPorcentaje,
  };
}

// Ejecuta la acción de una regla ya disparada (fila en disparos_regla_whatsapp
// ya insertada, para idempotencia) contra un cliente concreto: si corresponde
// genera el Cupon "descuento" atado a la patente (reconocible sin código al
// volver, ver OperadorFoundResult) y siempre intenta el envío de WhatsApp.
// `ventaMonto` solo se usa para el placeholder {{monto}} en reglas
// "venta_creada" (ej. "confirmamos tu compra de {{monto}}"); en
// "plan_proximo_vencer" no aplica. `patenteAnterior` solo se usa en
// "cambio_patente" (ver evaluarReglasPorCambioPatente en ./disparadores),
// para el placeholder {{patenteAnterior}}.
export async function ejecutarAccionRegla(
  regla: ReglaWhatsapp,
  disparoId: string,
  cliente: Cliente,
  ventaMonto?: number,
  patenteAnterior?: string
): Promise<void> {
  if (!cliente.telefono) {
    console.error(`Regla WhatsApp "${regla.nombre}": cliente ${cliente.id} sin teléfono, no se puede enviar`);
    await marcarDisparoReglaWhatsapp(disparoId, { estado: "error" });
    return;
  }
  const plantilla = await obtenerPlantillaWhatsapp(regla.plantillaWhatsappId);
  if (!plantilla) {
    console.error(`Regla WhatsApp "${regla.nombre}": plantilla ${regla.plantillaWhatsappId} no existe`);
    await marcarDisparoReglaWhatsapp(disparoId, { estado: "error" });
    return;
  }

  let cuponId: string | undefined;
  let montoOferta: number | undefined;
  let diasValidez: number | undefined;
  if (regla.accion === "cupon_descuento") {
    diasValidez = regla.cuponValidezDias ?? 7;
    const [codigo] = await generarCodigosCuponUnicos(1);
    const nuevo = crearCuponDescuento({
      codigo,
      patente: cliente.patente,
      valor: regla.cuponValor || 0,
      esPorcentaje: regla.cuponEsPorcentaje || false,
      validezDias: diasValidez,
      nombreLote: `WhatsApp - ${regla.nombre}`,
      creadoPor: `regla-whatsapp:${regla.id}`,
    });
    const ok = await upsertCupones([nuevo]);
    if (ok) {
      cuponId = nuevo.id;
      montoOferta = regla.cuponValor;
    }
  }

  const variables = construirVariables({ cliente, monto: ventaMonto, montoOferta, diasValidez, patenteAnterior });

  // Con PUSH_FALLBACK_A_WHATSAPP="true" (opt-in, ver plan de la PWA), si el
  // cliente tiene una suscripción push activa y el envío llega, nos ahorramos
  // el mensaje de plantilla pago; sin la variable (o en "false") el
  // comportamiento queda igual que siempre — push es aditivo, no reemplaza
  // nada hasta que el dueño del negocio confirme que quiere el ahorro real.
  let pushEntregado = false;
  if (process.env.PUSH_FALLBACK_A_WHATSAPP === "true") {
    pushEntregado = await enviarPush(cliente.id, {
      title: regla.nombre,
      body: aplicarVariables(plantilla.mensaje, variables),
      url: "/cliente",
    }).catch((error) => {
      console.error(`Regla WhatsApp "${regla.nombre}": error enviando push`, error);
      return false;
    });
  }

  if (pushEntregado) {
    await marcarDisparoReglaWhatsapp(disparoId, { estado: "enviado", cuponId });
    return;
  }

  const mensaje = await enviarSegunPlantilla(plantilla, cliente.telefono, variables);
  // `mensaje` siempre existe salvo que falte metaNombre — enviarMensajePlantilla
  // (@/lib/whatsapp/enviar) registra la fila de todos modos aunque la Graph
  // API rechace el envío, con estado "fallido" adentro. Hay que mirar ese
  // estado real, no solo si `mensaje` es truthy.
  await marcarDisparoReglaWhatsapp(disparoId, {
    estado: mensaje?.estado === "enviado" ? "enviado" : "error",
    cuponId,
    mensajeWhatsappId: mensaje?.id,
  });
}
