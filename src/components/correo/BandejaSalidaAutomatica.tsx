"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listarCorreosAutomaticos, obtenerCorreoAutomatico } from "@/lib/serverActions";
import { fmtFecha, fmtHora } from "@/lib/helpers";
import type { CorreoAutomatico, CorreoAutomaticoResumen } from "@/types";
import { AlertTriangle, RefreshCw, Send } from "lucide-react";

// Bandeja de salida del remitente automático (no-reply@zplash.cl o lo que
// diga MAIL_FROM_ADDRESS): qué correo salió, a quién y con qué contenido
// exacto. Vive dentro de CorreoView como una pseudo-carpeta más, pero NO sale
// de IMAP como el resto de las carpetas — esa cuenta no tiene buzón, los
// correos salen por API (Resend) y lo que se lista acá es la copia que guarda
// enviarCorreoTransaccional en `correos_automaticos` (ver @/db/schema/mail).
//
// Es la vista "de correo" del mismo flujo que Web Settings → Historial
// Correo, y a propósito no la reemplaza: allá se mira el motor de reglas
// (qué regla se disparó, para qué venta o cliente, con su idempotencia) y
// acá se mira el correo en sí, incluido lo que se manda sin regla de negocio
// detrás.
export default function BandejaSalidaAutomatica() {
  const [correos, setCorreos] = useState<CorreoAutomaticoResumen[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<CorreoAutomatico | null>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [soloErrores, setSoloErrores] = useState(false);

  const cargar = async () => {
    setCargandoLista(true);
    setCorreos(await listarCorreosAutomaticos());
    setCargandoLista(false);
  };

  useEffect(() => {
    let cancelado = false;
    listarCorreosAutomaticos().then((rows) => {
      if (cancelado) return;
      setCorreos(rows);
      setCargandoLista(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const abrir = async (correo: CorreoAutomaticoResumen) => {
    setSeleccionado(correo.id);
    setDetalle(null);
    setCargandoDetalle(true);
    const d = await obtenerCorreoAutomatico(correo.id);
    setDetalle(d);
    setCargandoDetalle(false);
  };

  const totalErrores = correos.filter((c) => c.estado === "error").length;
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return correos.filter((c) => {
      if (soloErrores && c.estado !== "error") return false;
      if (!q) return true;
      return (
        c.para.toLowerCase().includes(q) ||
        c.asunto.toLowerCase().includes(q) ||
        (c.clienteNombre || "").toLowerCase().includes(q)
      );
    });
  }, [correos, busqueda, soloErrores]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por destinatario, cliente o asunto"
          className="h-9 w-full sm:w-80"
        />
        <Button size="sm" variant={soloErrores ? "default" : "outline"} onClick={() => setSoloErrores((v) => !v)}>
          <AlertTriangle size={16} />
          Solo errores{totalErrores ? ` (${totalErrores})` : ""}
        </Button>
        <Button size="sm" variant="outline" onClick={cargar} disabled={cargandoLista}>
          <RefreshCw size={16} />
          {cargandoLista ? "Cargando..." : "Actualizar"}
        </Button>
      </div>

      <div className="flex h-[calc(100vh-170px)] overflow-hidden rounded-lg border border-border">
        <div className={`w-full shrink-0 overflow-y-auto border-r border-border md:block md:w-80 ${seleccionado ? "hidden" : "block"}`}>
          {cargandoLista && correos.length === 0 && <div className="p-4 text-sm text-muted-foreground">Cargando...</div>}
          {!cargandoLista && visibles.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              {correos.length === 0
                ? "Todavía no ha salido ningún correo automático."
                : "Ningún correo calza con el filtro."}
            </div>
          )}
          {visibles.map((c) => (
            <button
              key={c.id}
              onClick={() => abrir(c)}
              className={`flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                seleccionado === c.id ? "bg-muted" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{c.clienteNombre || c.para}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtFecha(c.creadoEn)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {c.estado === "error" && (
                  <Badge variant="destructive" className="shrink-0">
                    Error
                  </Badge>
                )}
                <span className="truncate">{c.asunto}</span>
              </div>
            </button>
          ))}
        </div>

        <div className={`flex-1 flex-col md:flex ${seleccionado ? "flex" : "hidden"}`}>
          {!seleccionado ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Send size={32} />
              <span>Selecciona un correo enviado</span>
            </div>
          ) : cargandoDetalle || !detalle ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">Cargando correo...</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{detalle.asunto}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    De: {detalle.de} · {fmtFecha(detalle.creadoEn)} {fmtHora(detalle.creadoEn)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Para: {detalle.clienteNombre ? `${detalle.clienteNombre} <${detalle.para}>` : detalle.para}
                  </div>
                </div>
                <Badge variant={detalle.estado === "error" ? "destructive" : "secondary"} className="shrink-0">
                  {detalle.estado === "error" ? "Error" : "Enviado"}
                </Badge>
              </div>

              {detalle.error && (
                <div className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  No se pudo entregar: {detalle.error}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {/* Mismo encuadre que el visor del buzón IMAP (ver CorreoView):
                    el HTML se pinta aislado en un iframe sandbox, sin scripts
                    ni acceso al documento de la app. */}
                <iframe
                  title="Contenido del correo enviado"
                  sandbox="allow-same-origin"
                  srcDoc={detalle.html}
                  className="h-full w-full border-0"
                  onLoad={(e) => {
                    const doc = e.currentTarget.contentDocument;
                    if (doc) e.currentTarget.style.height = `${doc.documentElement.scrollHeight}px`;
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
