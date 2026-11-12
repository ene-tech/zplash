"use server";

import * as dataAccess from "@/lib/dataAccess";
import { esEmailEnviable, puedeBorrarAdjuntoCliente, puedeEnviarDocumentosCliente } from "@/lib/helpers";
import { reembolsoIdDeAdjunto, reenviarComprobanteReembolso } from "@/lib/pagos";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { sesionActual, tieneModulo } from "@/lib/session";
import { TIPOS_ADJUNTO_CLIENTE, type ClienteAdjunto, type TipoAdjuntoCliente } from "@/types";

// Documentos adjuntos en la ficha del cliente (ClienteInfoModal, módulo
// Clientes). Subir es en dos pasos porque el archivo no pasa por el servidor:
// 1) prepararAdjuntoCliente revisa permiso y entrega una URL firmada de
//    subida a una ruta que arma el servidor; 2) el navegador sube y
//    registrarAdjuntoCliente anota la fila, solo si el archivo ya está ahí.

const MAX_BYTES = 10 * 1024 * 1024; // igual que file_size_limit del bucket

function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
  return limpio || "archivo";
}

export async function listarAdjuntosCliente(clienteId: string): Promise<ClienteAdjunto[] | null> {
  if (!(await tieneModulo("clientes"))) return null;
  return dataAccess.listarAdjuntosCliente(String(clienteId));
}

export async function prepararAdjuntoCliente(
  clienteId: string,
  nombreArchivo: string,
  tamano: number,
): Promise<{ ok: true; id: string; ruta: string; token: string } | { ok: false; error: string }> {
  if (!(await tieneModulo("clientes"))) return { ok: false, error: "Sin permiso" };
  const cid = String(clienteId ?? "").trim();
  if (!cid || cid.includes("/")) return { ok: false, error: "Cliente inválido" };
  if (!(Number(tamano) > 0)) return { ok: false, error: "El archivo está vacío" };
  if (Number(tamano) > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 10 MB" };
  const id = "adj" + Date.now() + Math.floor(Math.random() * 1000);
  const firmada = await dataAccess.urlSubidaAdjuntoCliente(`${cid}/${id}-${nombreSeguro(String(nombreArchivo ?? ""))}`);
  if (!firmada) return { ok: false, error: "No se pudo preparar la subida" };
  return { ok: true, id, ...firmada };
}

export async function registrarAdjuntoCliente(datos: {
  id: string;
  clienteId: string;
  ruta: string;
  tipo: TipoAdjuntoCliente;
  detalle: string;
  nombreArchivo: string;
  tipoMime: string;
  tamano: number;
}): Promise<{ ok: true; adjunto: ClienteAdjunto } | { ok: false; error: string }> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("clientes")) return { ok: false, error: "Sin permiso" };
  const id = String(datos.id ?? "");
  const clienteId = String(datos.clienteId ?? "");
  const ruta = String(datos.ruta ?? "");
  // La ruta la armó prepararAdjuntoCliente: se exige esa misma forma para que
  // no se pueda anotar en una ficha un archivo de otra.
  if (!/^adj\d+$/.test(id) || !ruta.startsWith(`${clienteId}/${id}-`) || ruta.slice(clienteId.length + 1).includes("/"))
    return { ok: false, error: "Subida inválida" };
  if (!(datos.tipo in TIPOS_ADJUNTO_CLIENTE)) return { ok: false, error: "Tipo inválido" };
  const detalle = String(datos.detalle ?? "").trim().slice(0, 500);
  if (datos.tipo === "otro" && !detalle) return { ok: false, error: "Escribe a qué corresponde el documento" };
  if (!(await dataAccess.existeArchivoAdjunto(ruta))) return { ok: false, error: "El archivo no alcanzó a subir" };
  const adjunto = await dataAccess.insertarAdjuntoCliente({
    id,
    clienteId,
    tipo: datos.tipo,
    detalle: detalle || null,
    nombreArchivo: String(datos.nombreArchivo ?? "").slice(0, 200) || "archivo",
    tipoMime: String(datos.tipoMime ?? "").slice(0, 100) || null,
    tamano: Number(datos.tamano) || null,
    ruta,
    subidoPor: sesion.nombre,
  });
  return adjunto ? { ok: true, adjunto } : { ok: false, error: "No se pudo guardar" };
}

// Solo Gerencia (ver puedeBorrarAdjuntoCliente); el botón de la ficha usa el
// mismo helper, esto es el backstop porque la action es invocable por POST.
export async function eliminarAdjuntoCliente(clienteId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("clientes") || !puedeBorrarAdjuntoCliente(sesion.nombre))
    return { ok: false, error: "Solo Gerencia puede borrar adjuntos" };
  const ok = await dataAccess.eliminarAdjuntoCliente(String(clienteId), String(id));
  return ok ? { ok } : { ok, error: "No se pudo borrar" };
}

// Manda el archivo adjunto por correo (ej. el comprobante de devolución, el
// automático o uno subido a mano). Mismo gate que reembolsar: manda datos del
// cliente a la dirección que se escriba. El "detalle" no va en el correo: es
// la nota interna de quien lo subió.
export async function enviarAdjuntoClientePorCorreo(
  clienteId: string,
  id: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await sesionActual();
  if (!sesion || !puedeEnviarDocumentosCliente(sesion.modulos))
    return { ok: false, error: "Necesitas permisos de Gerencia o de cierre de caja para enviar documentos." };
  const destino = String(email ?? "").trim();
  if (!esEmailEnviable(destino)) return { ok: false, error: "El correo no es válido." };
  // El comprobante que dejó el reembolso sale con el mismo correo completo
  // que el botón del historial, no con el genérico de abajo.
  const reembolsoId = reembolsoIdDeAdjunto(String(id));
  if (reembolsoId) {
    const r = await reenviarComprobanteReembolso(reembolsoId, destino);
    if (r.ok) console.info("Comprobante de reembolso reenviado", reembolsoId, "por", sesion.nombre);
    return r;
  }
  const archivo = await dataAccess.descargarAdjuntoCliente(String(clienteId), String(id));
  if (!archivo) return { ok: false, error: "No se encontró el archivo." };
  const esDevolucion = archivo.adjunto.tipo === "devolucion";
  const r = await enviarCorreoTransaccional({
    to: destino,
    subject: esDevolucion ? "Tu comprobante de devolución — ZPlash" : "Documento de ZPlash",
    html: envolverHtmlBase(
      `<p style="margin:0 0 16px;">Hola,</p>
       <p style="margin:0 0 16px;">Te adjuntamos ${esDevolucion ? "el comprobante de tu devolución" : "el documento"} (${archivo.adjunto.nombreArchivo.replace(/[&<>"']/g, "")}).</p>
       <p style="margin:0;">Cualquier duda, escríbenos a info@zplash.cl.</p>`,
      { boton: false },
    ),
    adjuntos: [{ nombre: archivo.adjunto.nombreArchivo, contenido: archivo.contenido }],
    clienteId: archivo.adjunto.clienteId,
  });
  if (!r.ok) return { ok: false, error: "No se pudo enviar el correo." };
  console.info("Adjunto enviado por correo", archivo.adjunto.id, "por", sesion.nombre);
  return { ok: true };
}

export async function urlAdjuntoCliente(clienteId: string, id: string): Promise<string | null> {
  if (!(await tieneModulo("clientes"))) return null;
  return dataAccess.urlAdjuntoCliente(String(clienteId), String(id));
}
