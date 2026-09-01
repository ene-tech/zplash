"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { beneficioCupon, cuponDescuentoDePatente, fmtFecha, fmtTelefono, planStatus, plateEstadoCls } from "@/lib/helpers";
import type { Cliente, ConversacionWhatsapp } from "@/types";

// Hoja de registro del cliente debajo del chat de WhatsApp: los datos que el
// operador necesita para responder dudas sin salir de la conversación. Las
// fichas llegan ya resueltas por teléfono desde MensajesView — un mismo
// número puede tener varias, porque los clientes se guardan por patente y un
// dueño con dos autos son dos fichas. Lo profundo (historial de compras,
// cupones emitidos, suscripción, cobros) no se duplica acá: "Ficha completa"
// abre el mismo ClienteInfoModal del módulo Clientes.
export function FichaClienteChat({ conversacion, fichas }: { conversacion: ConversacionWhatsapp; fichas: Cliente[] }) {
  const { data, patchUi } = useAppData();
  const [idVista, setIdVista] = useState<string | null>(null);
  const c = fichas.find((x) => x.id === idVista) ?? fichas[0];

  // Mismo criterio que ClienteInfoModal: si no hay uno cobrable en el mesón se
  // muestra igual el que solo vale por la web — acá se informa, no se cobra.
  const descuento = useMemo(
    () =>
      c
        ? cuponDescuentoDePatente(data.cupones, c.patente, "local") ?? cuponDescuentoDePatente(data.cupones, c.patente, "web")
        : undefined,
    [data.cupones, c]
  );

  const estado = c ? planStatus(c) : null;

  return (
    <details open className="shrink-0 border-t border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
        <span>Ficha del cliente</span>
        {estado ? (
          <span className={`status-pill ${estado.cls}`}>{estado.label}</span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">Sin registrar</span>
        )}
      </summary>

      <div className="max-h-52 overflow-y-auto px-3 pb-2">
        {!c ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Ninguna ficha tiene el número {fmtTelefono(conversacion.telefono)}.</span>
            <Button
              size="sm"
              onClick={() => patchUi({ modal: { type: "client", data: null, telefonoInicial: conversacion.telefono } })}
            >
              Crear ficha
            </Button>
          </div>
        ) : (
          <>
            {fichas.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {fichas.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setIdVista(f.id)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      f.id === c.id ? "border-primary text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {f.patente}
                  </button>
                ))}
              </div>
            )}
            <div className="info-grid">
              <div>
                <div className="k">Nombre</div>
                <div className="v">{c.nombre}</div>
              </div>
              <div>
                <div className="k">Patente</div>
                <div className={`v plate-tag ${plateEstadoCls(c)}`}>{c.patente}</div>
              </div>
              <div>
                <div className="k">Vehículo</div>
                <div className="v">{c.vehiculo || "-"}</div>
              </div>
              <div>
                <div className="k">Plan</div>
                <div className="v">{c.plan || "Sin plan"}</div>
              </div>
              <div>
                <div className="k">Vence</div>
                <div className="v">{c.vencimiento ? fmtFecha(c.vencimiento) : "-"}</div>
              </div>
              <div>
                <div className="k">Visitas</div>
                <div className="v">
                  {c.visitas || 0}
                  {c.ultimaVisita ? ` · última ${fmtFecha(c.ultimaVisita)}` : ""}
                </div>
              </div>
              <div>
                <div className="k">Correo</div>
                <div className="v break-all">{c.email || "-"}</div>
              </div>
              <div>
                <div className="k">Teléfono</div>
                <div className="v">{c.telefono ? fmtTelefono(c.telefono) : "-"}</div>
              </div>
              <div className="col-span-2">
                <div className="k">Descuento disponible</div>
                <div className="v">
                  {descuento
                    ? `${beneficioCupon(descuento)}${descuento.canal === "web" ? " (solo por la web)" : ""} — código ${descuento.codigo}, vence ${fmtFecha(descuento.fechaCaducidad)}`
                    : "No tiene"}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {c && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          <Button size="sm" variant="outline" onClick={() => patchUi({ modal: { type: "clienteInfo", data: c } })}>
            Ficha completa
          </Button>
          <Button size="sm" variant="outline" onClick={() => patchUi({ modal: { type: "client", data: c } })}>
            Editar ficha
          </Button>
        </div>
      )}
    </details>
  );
}
