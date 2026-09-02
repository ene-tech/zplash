"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { listarComunicacionesCliente } from "@/lib/serverActions";
import { ETIQUETA_ETAPA, construirRecorrido, fmtFecha, fmtHora, formatTelefono } from "@/lib/helpers";
import type { ComunicacionesCliente, EventoRecorrido } from "@/lib/helpers";
import type { Cliente } from "@/types";

const ICONO: Record<EventoRecorrido["tipo"], string> = {
  ingreso: "🚗",
  venta: "💲",
  cobro: "💳",
  correo: "✉️",
  whatsapp: "💬",
};

const COLOR_ESTADO: Record<EventoRecorrido["estado"], string> = {
  ok: "var(--green)",
  error: "var(--red)",
  neutro: "var(--gold)",
};

// Lo que le pasó al auto y a su plata (recorrido) va aparte de lo que le
// dijimos (comunicaciones): mezclado en una sola lista, un cliente con muchos
// mensajes tapaba las pasadas y los cobros, que es lo que se mira primero.
const TIPO_COMUNICACION = new Set<EventoRecorrido["tipo"]>(["correo", "whatsapp"]);

const VACIO: ComunicacionesCliente = { correos: [], whatsapp: [], cobros: [] };

/**
 * La línea de tiempo del cliente dentro de su ficha, en dos bloques: lo que
 * hizo (pasadas, compras, cobros) y lo que se le dijo (correos y WhatsApp),
 * cada uno agrupado por la etapa en la que estaba en ese momento. Responde la
 * pregunta que ninguna de las pantallas por canal (Historial Correo, Historial
 * WhatsApp, Mensajes) puede responder sola: qué le fue pasando a ESTE cliente
 * y qué le fuimos diciendo.
 */
export function RecorridoCliente({ cliente }: { cliente: Cliente }) {
  const { data, loadingHistorial } = useAppData();
  // De qué cliente son los datos guardados: así "¿está cargando?" se deriva
  // (lo guardado no es de este cliente) en vez de mantenerse en un flag que
  // el efecto tenga que prender a mano en cada cambio de ficha.
  const [cargado, setCargado] = useState<{ clienteId: string; comunicaciones: ComunicacionesCliente } | null>(null);
  const cargando = cargado?.clienteId !== cliente.id;

  useEffect(() => {
    let cancelado = false;
    const clienteId = cliente.id;
    listarComunicacionesCliente(clienteId, formatTelefono(cliente.telefono) || undefined, cliente.patente)
      .then((comunicaciones) => {
        if (!cancelado) setCargado({ clienteId, comunicaciones });
      })
      .catch(() => {
        if (!cancelado) setCargado({ clienteId, comunicaciones: VACIO });
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.id, cliente.telefono, cliente.patente]);

  const eventos = useMemo(
    () =>
      construirRecorrido({
        clienteId: cliente.id,
        ventas: data.ventas,
        ingresos: data.ingresos,
        comunicaciones: cargando || !cargado ? VACIO : cargado.comunicaciones,
      }),
    [cliente.id, data.ventas, data.ingresos, cargando, cargado]
  );

  return (
    <>
      {/* Los cobros salen de listarComunicacionesCliente y las pasadas/ventas
          de la oleada "historial", así que el recorrido espera a las dos. */}
      <Bloque
        titulo="Recorrido"
        eventos={eventos.filter((e) => !TIPO_COMUNICACION.has(e.tipo))}
        cargando={cargando || loadingHistorial}
        vacio="Todavía no hay pasadas, compras ni cobros de este cliente."
      />
      <Bloque
        titulo="Comunicaciones"
        eventos={eventos.filter((e) => TIPO_COMUNICACION.has(e.tipo))}
        cargando={cargando}
        vacio="Todavía no se le mandó ningún correo ni WhatsApp."
      />
    </>
  );
}

function Bloque({
  titulo,
  eventos,
  cargando,
  vacio,
}: {
  titulo: string;
  eventos: EventoRecorrido[];
  cargando: boolean;
  vacio: string;
}) {
  return (
    <div className="border-t border-border pt-3.5">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ol className="space-y-1">
          {eventos.map((e, i) => {
            // Encabezado de etapa cada vez que cambia respecto del evento
            // anterior (van de más nuevo a más viejo): así se lee de un
            // vistazo qué pasó mientras estaba por vencer, qué mientras
            // estaba vencido, etc.
            const abreEtapa = i === 0 || eventos[i - 1].etapa !== e.etapa;
            return (
              <li key={e.id}>
                {abreEtapa && (
                  <div className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
                    {ETIQUETA_ETAPA[e.etapa]}
                  </div>
                )}
                <div className="flex gap-2.5 border-l-2 py-1 pl-2.5 text-sm" style={{ borderColor: COLOR_ESTADO[e.estado] }}>
                  <span aria-hidden className="shrink-0">
                    {ICONO[e.tipo]}
                  </span>
                  <span className="w-28 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {fmtFecha(e.fecha)} {fmtHora(e.fecha)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="break-words">
                      {e.tipo === "whatsapp" && (
                        <span className="mr-1 text-muted-foreground">{e.direccion === "entrante" ? "←" : "→"}</span>
                      )}
                      {e.titulo}
                    </span>
                    {e.detalle && <span className="block text-xs text-muted-foreground">{e.detalle}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
