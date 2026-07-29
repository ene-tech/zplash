"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { enviarMensajeManual, listarConversaciones, listarMensajes, marcarLeida } from "@/lib/serverActions";
import { fmtFecha, fmtHora } from "@/lib/helpers";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import type { ConversacionWhatsapp, MensajeWhatsapp } from "@/types";
import { ArrowLeft, Bell, MessageCircle, Send } from "lucide-react";

const INTERVALO_POLL_MS = 10000;
const VENTANA_24H_MS = 24 * 60 * 60 * 1000;

function fueraDeVentana24h(mensajes: MensajeWhatsapp[]): boolean {
  const ultimoEntrante = [...mensajes].reverse().find((m) => m.direccion === "entrante");
  if (!ultimoEntrante) return true;
  return Date.now() - new Date(ultimoEntrante.creadoEn).getTime() > VENTANA_24H_MS;
}

export default function MensajesView() {
  const { data, ui, patchUi, logout } = useApp();
  const esGerencia = ui.perfilActual?.nombre === "Gerencia";
  const { estado: estadoPush, activar: activarPush } = usePushSubscription("/api/perfiles/push/suscribir");
  const [conversaciones, setConversaciones] = useState<ConversacionWhatsapp[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeWhatsapp[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const rows = await listarConversaciones();
      if (!cancelado) setConversaciones(rows);
    };
    cargar();
    const id = setInterval(cargar, INTERVALO_POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!seleccionada) return;
    let cancelado = false;
    const cargar = async () => {
      const rows = await listarMensajes(seleccionada);
      if (!cancelado) setMensajes(rows);
    };
    cargar();
    marcarLeida(seleccionada);
    const id = setInterval(cargar, INTERVALO_POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [seleccionada]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensajes]);

  const conversacionActual = conversaciones.find((c) => c.id === seleccionada);
  const clienteActual = conversacionActual?.clienteId ? data.clientes.find((c) => c.id === conversacionActual.clienteId) : undefined;
  const puedeEnviarLibre = !fueraDeVentana24h(mensajes);

  const seleccionar = (c: ConversacionWhatsapp) => {
    setSeleccionada(c.id);
    setConversaciones((prev) => prev.map((x) => (x.id === c.id ? { ...x, noLeidos: 0 } : x)));
  };

  const enviar = async () => {
    if (!conversacionActual || !texto.trim() || enviando) return;
    setEnviando(true);
    const ok = await enviarMensajeManual(conversacionActual.id, conversacionActual.telefono, texto);
    if (ok) {
      setTexto("");
      const rows = await listarMensajes(conversacionActual.id);
      setMensajes(rows);
    }
    setEnviando(false);
  };

  return (
    <>
      <Topbar mode={`Mensajes WhatsApp · ${ui.perfilActual?.nombre || ""}`} onLogout={() => logout()} onBack={() => patchUi({ view: "hub" })} />
      <div className="content">
        {esGerencia && (estadoPush === "inactivo" || estadoPush === "error") && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Bell size={16} />
              Activa las notificaciones para enterarte al instante cuando un cliente pida hablar con una persona.
              {estadoPush === "error" && <span className="text-destructive"> No pudimos activarlas, intenta de nuevo.</span>}
            </span>
            <Button variant="outline" size="sm" onClick={activarPush}>
              Activar notificaciones
            </Button>
          </div>
        )}
        <div className="flex h-[calc(100vh-56px)] overflow-hidden rounded-lg border border-border">
          <div
            className={`w-full shrink-0 overflow-y-auto border-r border-border md:block md:w-72 ${
              seleccionada ? "hidden" : "block"
            }`}
          >
            {conversaciones.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Sin conversaciones todavía.</div>
            )}
            {conversaciones.map((c) => {
              const cliente = c.clienteId ? data.clientes.find((cl) => cl.id === c.clienteId) : undefined;
              const nombre = cliente?.nombre || c.nombreContacto || c.telefono;
              return (
                <button
                  key={c.id}
                  onClick={() => seleccionar(c)}
                  className={`flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                    seleccionada === c.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{nombre}</span>
                    {c.noLeidos > 0 && <Badge>{c.noLeidos}</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{cliente?.patente || c.telefono}</span>
                    <span className="shrink-0">{fmtHora(c.ultimoMensajeEn)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className={`flex-1 flex-col md:flex ${seleccionada ? "flex" : "hidden"}`}>
            {!conversacionActual ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageCircle size={32} />
                <span>Selecciona una conversación</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <button
                    onClick={() => setSeleccionada(null)}
                    className="-ml-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted md:hidden"
                    aria-label="Volver a conversaciones"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{clienteActual?.nombre || conversacionActual.nombreContacto || conversacionActual.telefono}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {clienteActual?.patente ? `${clienteActual.patente} · ` : ""}
                      {conversacionActual.telefono}
                    </div>
                  </div>
                </div>

                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                  {mensajes.map((m) => (
                    <div key={m.id} className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-1.5 text-sm ${
                          m.direccion === "saliente" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.texto}</div>
                        <div className="mt-0.5 text-right text-[10px] opacity-70">
                          {fmtFecha(m.creadoEn)} {fmtHora(m.creadoEn)}
                          {m.direccion === "saliente" && m.estado === "fallido" && " · Error"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border p-3">
                  {!puedeEnviarLibre && (
                    <div className="mb-2 text-xs text-muted-foreground">
                      Pasaron más de 24h desde el último mensaje del cliente — WhatsApp solo permite responder con una plantilla aprobada.
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      disabled={!puedeEnviarLibre || enviando}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          enviar();
                        }
                      }}
                    />
                    <Button onClick={enviar} disabled={!puedeEnviarLibre || !texto.trim() || enviando} size="icon">
                      <Send size={16} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
