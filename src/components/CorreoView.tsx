"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { crearCarpetaBuzon, eliminarCarpetaBuzon, listarCarpetasBuzon, listarCorreos, obtenerAdjuntoCorreo, obtenerCorreo, renombrarCarpetaBuzon } from "@/lib/serverActions";
import { fmtFecha, fmtHora } from "@/lib/helpers";
import type { CarpetaBuzon, CorreoDetalle, CorreoResumen } from "@/types";
import BandejaSalidaAutomatica from "@/components/correo/BandejaSalidaAutomatica";
import FiltrosCorreoPanel from "@/components/correo/FiltrosCorreoPanel";
import { Filter, FolderPlus, Inbox, Paperclip, Pencil, PenSquare, Reply, Send, Trash2 } from "lucide-react";

const INTERVALO_POLL_MS = 30000;

function fmtTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function descargarAdjunto(carpetaPath: string, uid: number, indice: number) {
  const adjunto = await obtenerAdjuntoCorreo(carpetaPath, uid, indice);
  if (!adjunto) return;
  const a = document.createElement("a");
  a.href = `data:${adjunto.tipo};base64,${adjunto.base64}`;
  a.download = adjunto.nombre;
  a.click();
}

export default function CorreoView() {
  const { ui, patchUi, logout } = useApp();
  const [carpetas, setCarpetas] = useState<CarpetaBuzon[]>([]);
  const [carpetaActual, setCarpetaActual] = useState<string | null>(null);
  const [correos, setCorreos] = useState<CorreoResumen[]>([]);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<CorreoDetalle | null>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState("");
  const [mostrandoFiltros, setMostrandoFiltros] = useState(false);
  // Pseudo-carpeta: la bandeja de salida del remitente automático no es una
  // carpeta IMAP (esa cuenta no tiene buzón, ver BandejaSalidaAutomatica),
  // así que se elige aparte de `carpetaActual` en vez de sumarse a `carpetas`.
  const [mostrandoSalidaAuto, setMostrandoSalidaAuto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarCarpetasBuzon()
      .then((rows) => {
        if (cancelado) return;
        setCarpetas(rows);
        const inbox = rows.find((c) => c.especial === "inbox") || rows[0];
        if (inbox) setCarpetaActual(inbox.path);
        else setError("No se pudo conectar al buzón de correo.");
      })
      .catch(() => !cancelado && setError("No se pudo conectar al buzón de correo."));
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!carpetaActual) return;
    let cancelado = false;
    const cargar = async () => {
      setCargandoLista(true);
      const rows = await listarCorreos(carpetaActual);
      if (!cancelado) {
        setCorreos(rows);
        setCargandoLista(false);
      }
    };
    cargar();
    const id = setInterval(cargar, INTERVALO_POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [carpetaActual]);

  const cambiarCarpeta = (path: string) => {
    setCarpetaActual(path);
    setSeleccionado(null);
    setDetalle(null);
    setMostrandoSalidaAuto(false);
    setMostrandoFiltros(false);
  };

  const crearCarpeta = async () => {
    const nombre = window.prompt("Nombre de la nueva carpeta");
    if (!nombre?.trim()) return;
    const ok = await crearCarpetaBuzon(nombre);
    if (ok) setCarpetas(await listarCarpetasBuzon());
    else setError("No se pudo crear la carpeta (¿ya existe?)");
  };

  const renombrarCarpetaUI = async (c: CarpetaBuzon, e: React.MouseEvent) => {
    e.stopPropagation();
    const nuevo = window.prompt("Nuevo nombre de la carpeta", c.nombre)?.trim();
    if (!nuevo || nuevo === c.nombre) return;
    const ok = await renombrarCarpetaBuzon(c.path, nuevo);
    if (!ok) {
      setError("No se pudo renombrar la carpeta");
      return;
    }
    const rows = await listarCarpetasBuzon();
    setCarpetas(rows);
    const actualizada = rows.find((r) => r.nombre === nuevo);
    if (actualizada) cambiarCarpeta(actualizada.path);
  };

  const eliminarCarpetaUI = (c: CarpetaBuzon, e: React.MouseEvent) => {
    e.stopPropagation();
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Borrar la carpeta "${c.nombre}"? Se eliminarán todos los correos que contiene.`,
        confirmLabel: "Borrar",
        danger: true,
        onConfirm: async () => {
          const ok = await eliminarCarpetaBuzon(c.path);
          if (!ok) {
            setError("No se pudo borrar la carpeta");
            return;
          }
          if (carpetaActual === c.path) cambiarCarpeta("INBOX");
          setCarpetas(await listarCarpetasBuzon());
        },
      },
    });
  };

  const abrir = async (correo: CorreoResumen) => {
    if (!carpetaActual) return;
    setSeleccionado(correo.uid);
    setDetalle(null);
    setCargandoDetalle(true);
    setCorreos((prev) => prev.map((c) => (c.uid === correo.uid ? { ...c, leido: true } : c)));
    const d = await obtenerCorreo(carpetaActual, correo.uid);
    setDetalle(d);
    setCargandoDetalle(false);
  };

  const responder = () => detalle && patchUi({ modal: { type: "correoRedactar", original: detalle } });
  const redactar = () => patchUi({ modal: { type: "correoRedactar" } });

  return (
    <>
      <Topbar mode={`Correo · ${ui.perfilActual?.nombre || ""}`} onLogout={() => logout()} onBack={() => patchUi({ view: "hub" })} />
      <div className="content">
        {error && <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="tabs tabs-primary flex-wrap">
            {carpetas.map((c) => (
              <div
                key={c.path}
                className={`tab group gap-1 ${carpetaActual === c.path && !mostrandoSalidaAuto ? "active" : ""}`}
                onClick={() => cambiarCarpeta(c.path)}
                title={c.nombre}
              >
                <span className="tab-label">{c.nombre}</span>
                {!c.especial && (
                  <span className="ml-1 hidden items-center gap-1 group-hover:flex">
                    <Pencil size={11} onClick={(e) => renombrarCarpetaUI(c, e)} className="opacity-60 hover:opacity-100" />
                    <Trash2 size={11} onClick={(e) => eliminarCarpetaUI(c, e)} className="opacity-60 hover:opacity-100 hover:text-destructive" />
                  </span>
                )}
              </div>
            ))}
            <button type="button" className="tab" onClick={crearCarpeta} title="Nueva carpeta">
              <FolderPlus size={14} />
            </button>
            <div
              className={`tab gap-1 ${mostrandoSalidaAuto ? "active" : ""}`}
              onClick={() => {
                setMostrandoSalidaAuto(true);
                setMostrandoFiltros(false);
              }}
              title="Correos que salieron solos desde el remitente automático (reglas, campañas y envíos únicos)"
            >
              <Send size={12} />
              <span className="tab-label">Salida automática</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMostrandoFiltros(true)}>
              <Filter size={16} />
              Filtros
            </Button>
            <Button size="sm" onClick={redactar}>
              <PenSquare size={16} />
              Redactar
            </Button>
          </div>
        </div>

        {mostrandoFiltros ? (
          <FiltrosCorreoPanel carpetas={carpetas} onVolver={() => setMostrandoFiltros(false)} />
        ) : mostrandoSalidaAuto ? (
          <BandejaSalidaAutomatica />
        ) : (

        <div className="flex h-[calc(100vh-120px)] overflow-hidden rounded-lg border border-border">
          <div className={`w-full shrink-0 overflow-y-auto border-r border-border md:block md:w-80 ${seleccionado ? "hidden" : "block"}`}>
            {cargandoLista && correos.length === 0 && <div className="p-4 text-sm text-muted-foreground">Cargando...</div>}
            {!cargandoLista && correos.length === 0 && <div className="p-4 text-sm text-muted-foreground">Sin correos en esta carpeta.</div>}
            {correos.map((c) => (
              <button
                key={c.uid}
                onClick={() => abrir(c)}
                className={`flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                  seleccionado === c.uid ? "bg-muted" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.leido ? "font-normal" : "font-semibold"}`}>{c.de}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtFecha(c.fecha)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {c.tieneAdjuntos && <Paperclip size={12} />}
                  <span className={`truncate ${c.leido ? "" : "font-medium text-foreground"}`}>{c.asunto}</span>
                </div>
              </button>
            ))}
          </div>

          <div className={`flex-1 flex-col md:flex ${seleccionado ? "flex" : "hidden"}`}>
            {!seleccionado ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Inbox size={32} />
                <span>Selecciona un correo</span>
              </div>
            ) : cargandoDetalle || !detalle ? (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">Cargando correo...</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{detalle.asunto}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      De: {detalle.de} &lt;{detalle.deEmail}&gt; · {fmtFecha(detalle.fecha)} {fmtHora(detalle.fecha)}
                    </div>
                    {detalle.para.length > 0 && <div className="truncate text-xs text-muted-foreground">Para: {detalle.para.join(", ")}</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={responder} className="shrink-0">
                    <Reply size={16} />
                    Responder
                  </Button>
                </div>

                {detalle.adjuntos.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2.5">
                    {detalle.adjuntos.map((a) => (
                      <Badge
                        key={a.indice}
                        variant="outline"
                        className="h-auto cursor-pointer gap-1.5 px-2 py-1"
                        onClick={() => carpetaActual && descargarAdjunto(carpetaActual, detalle.uid, a.indice)}
                      >
                        <Paperclip size={12} />
                        {a.nombre} ({fmtTamano(a.tamano)})
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {detalle.html ? (
                    <iframe
                      title="Contenido del correo"
                      sandbox="allow-same-origin"
                      srcDoc={detalle.html}
                      className="h-full w-full border-0"
                      onLoad={(e) => {
                        const doc = e.currentTarget.contentDocument;
                        if (doc) e.currentTarget.style.height = `${doc.documentElement.scrollHeight}px`;
                      }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap px-4 py-3 text-sm">{detalle.texto || <span className="text-muted-foreground">(sin contenido)</span>}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </div>
    </>
  );
}
