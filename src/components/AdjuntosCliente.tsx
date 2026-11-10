"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import {
  eliminarAdjuntoCliente,
  listarAdjuntosCliente,
  prepararAdjuntoCliente,
  registrarAdjuntoCliente,
  urlAdjuntoCliente,
} from "@/lib/serverActions";
import { fmtDate, puedeBorrarAdjuntoCliente } from "@/lib/helpers";
import { TIPOS_ADJUNTO_CLIENTE, type ClienteAdjunto, type TipoAdjuntoCliente } from "@/types";

function fmtTamano(b?: number) {
  if (!b) return "";
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// Documentos adjuntos de la ficha (comprobantes de devolución u otros), con
// a qué corresponde cada uno. Ver @/lib/serverActions/clienteAdjuntos: el
// archivo sube directo del navegador al bucket privado con una URL firmada.
// Sin módulo "clientes" la lista vuelve null y la sección no se muestra. La
// ficha lo monta con key={clienteId}: al cambiar de cliente se descarta el
// archivo elegido, para no adjuntarlo en la ficha equivocada.
export default function AdjuntosCliente({ clienteId }: { clienteId: string }) {
  // undefined = cargando; null = sin permiso; "error" = no se pudo leer.
  const [adjuntos, setAdjuntos] = useState<ClienteAdjunto[] | null | "error" | undefined>(undefined);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<TipoAdjuntoCliente>("devolucion");
  const [detalle, setDetalle] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const { ui } = useApp();
  const puedeBorrar = puedeBorrarAdjuntoCliente(ui.perfilActual?.nombre);

  useEffect(() => {
    let obsoleto = false;
    listarAdjuntosCliente(clienteId)
      .then((lista) => {
        if (!obsoleto) setAdjuntos(lista);
      })
      .catch(() => {
        if (!obsoleto) setAdjuntos("error");
      });
    return () => {
      obsoleto = true;
    };
  }, [clienteId]);

  // Mientras carga no se muestra nada: todavía no se sabe si hay permiso.
  if (adjuntos === null || adjuntos === undefined) return null;

  async function subir() {
    if (!archivo) return setErr("Elige un archivo.");
    if (tipo === "otro" && !detalle.trim()) return setErr("Escribe a qué corresponde el documento.");
    setErr("");
    setSubiendo(true);
    try {
      const prep = await prepararAdjuntoCliente(clienteId, archivo.name, archivo.size);
      if (!prep.ok) return setErr(prep.error);
      const { error } = await supabase.storage.from("adjuntos-clientes").uploadToSignedUrl(prep.ruta, prep.token, archivo, {
        contentType: archivo.type || undefined,
      });
      if (error) return setErr("No se pudo subir el archivo. Intenta de nuevo.");
      const res = await registrarAdjuntoCliente({
        id: prep.id,
        clienteId,
        ruta: prep.ruta,
        tipo,
        detalle,
        nombreArchivo: archivo.name,
        tipoMime: archivo.type,
        tamano: archivo.size,
      });
      if (!res.ok) return setErr(res.error);
      setAdjuntos((prev) => [res.adjunto, ...(Array.isArray(prev) ? prev : [])]);
      setArchivo(null);
      setDetalle("");
      if (inputArchivo.current) inputArchivo.current.value = "";
    } catch {
      setErr("No se pudo subir el archivo (sin conexión).");
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(a: ClienteAdjunto) {
    if (!window.confirm(`¿Borrar "${a.nombreArchivo}"? No se puede deshacer.`)) return;
    setErr("");
    setBorrando(a.id);
    try {
      const res = await eliminarAdjuntoCliente(clienteId, a.id);
      if (!res.ok) return setErr(res.error ?? "No se pudo borrar.");
      setAdjuntos((prev) => (Array.isArray(prev) ? prev.filter((x) => x.id !== a.id) : prev));
    } catch {
      setErr("No se pudo borrar (sin conexión).");
    } finally {
      setBorrando(null);
    }
  }

  async function ver(a: ClienteAdjunto) {
    setErr("");
    // La pestaña se abre antes del await: si se abre después, el navegador
    // la trata como popup y la bloquea.
    const ventana = window.open("", "_blank");
    if (ventana) ventana.opener = null;
    try {
      const url = await urlAdjuntoCliente(clienteId, a.id);
      if (url && ventana) ventana.location.href = url;
      else {
        ventana?.close();
        setErr("No se pudo abrir el archivo.");
      }
    } catch {
      ventana?.close();
      setErr("No se pudo abrir el archivo (sin conexión).");
    }
  }

  return (
    <div className="border-t border-border pt-5">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Documentos adjuntos</div>

      {adjuntos === "error" && (
        <p className="mb-3 text-sm text-destructive">No se pudieron cargar los documentos adjuntos. Cierra y vuelve a abrir la ficha.</p>
      )}
      {Array.isArray(adjuntos) && adjuntos.length > 0 && (
        <ul className="mb-3 space-y-2 text-sm">
          {adjuntos.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <div className="font-medium">{TIPOS_ADJUNTO_CLIENTE[a.tipo] ?? a.tipo}</div>
                {a.detalle && <p className="whitespace-pre-wrap">{a.detalle}</p>}
                <div className="truncate text-xs text-muted-foreground">
                  {a.nombreArchivo}
                  {a.tamano ? ` · ${fmtTamano(a.tamano)}` : ""} · {a.subidoPor || "sin perfil"} · {fmtDate(a.subidoEn)}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => ver(a)}>
                  Ver
                </Button>
                {puedeBorrar && (
                  <Button size="sm" variant="ghost" onClick={() => borrar(a)} disabled={borrando === a.id}>
                    {borrando === a.id ? "Borrando…" : "Borrar"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAdjuntoCliente)} disabled={subiendo}>
          {Object.entries(TIPOS_ADJUNTO_CLIENTE).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <Input
          placeholder={tipo === "otro" ? "¿A qué corresponde? (obligatorio)" : "¿A qué corresponde? (ej. devolución del plan de octubre)"}
          value={detalle}
          maxLength={500}
          onChange={(e) => setDetalle(e.target.value)}
          disabled={subiendo}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputArchivo}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf,.doc,.docx,.xls,.xlsx"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          disabled={subiendo}
          className="text-sm"
        />
        <Button size="sm" onClick={subir} disabled={subiendo || !archivo}>
          {subiendo ? "Subiendo…" : "Adjuntar"}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}
