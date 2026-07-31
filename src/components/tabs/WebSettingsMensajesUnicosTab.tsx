"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { enviarMensajesMasivosWhatsapp } from "@/lib/serverActions";
import { aplicarVariables, fmtFecha } from "@/lib/helpers";
import { BadgeAprobadoMeta } from "./BadgeAprobadoMeta";
import { ClientesSeleccionablesList } from "./mensajesUnicos/ClientesSeleccionablesList";
import { filtrarClientesMensajeMasivo } from "./mensajesUnicos/filtrarClientesMensajeMasivo";
import type { ResultadoEnvioMasivoWhatsapp } from "@/types";

const FILTROS_ESTADO = ["todos", "Vigente", "Por vencer", "Vencido", "Sin plan"] as const;
type FiltroEstado = (typeof FILTROS_ESTADO)[number];

const FILTROS_ORIGEN = ["todos", "WEB", "LOCAL"] as const;
type FiltroOrigen = (typeof FILTROS_ORIGEN)[number];

export default function WebSettingsMensajesUnicosTab() {
  const { data, patchUi } = useApp();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>("todos");
  const [visitasMin, setVisitasMin] = useState("");
  const [visitasMax, setVisitasMax] = useState("");
  const [inactivoDiasMin, setInactivoDiasMin] = useState("");
  const [clienteDesdeDiasMin, setClienteDesdeDiasMin] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [plantillaId, setPlantillaId] = useState("");
  const [montoOferta, setMontoOferta] = useState("");
  const [diasValidez, setDiasValidez] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioMasivoWhatsapp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const plantilla = data.plantillasWhatsapp.find((p) => p.id === plantillaId);

  const candidatos = useMemo(
    () => filtrarClientesMensajeMasivo(data.clientes, { filtroEstado, filtroOrigen, visitasMin, visitasMax, inactivoDiasMin, clienteDesdeDiasMin, busqueda }),
    [data.clientes, filtroEstado, filtroOrigen, visitasMin, visitasMax, inactivoDiasMin, clienteDesdeDiasMin, busqueda]
  );

  const seleccionables = candidatos.filter((c) => c.telefono);
  const sinTelefono = candidatos.length - seleccionables.length;
  const seleccionados = seleccionables.filter((c) => !excluidos.has(c.id));

  // Se chequea contra metaVariables (lo que enviarSegunPlantilla realmente
  // sustituye como parámetro posicional del template en Meta), no contra el
  // texto libre de plantilla.mensaje — el admin puede editar metaVariables a
  // mano y quedar desalineado del mensaje (ver hint en WebSettingsWhatsappTab).
  const metaVariablesMin = plantilla?.metaVariables?.map((v) => v.toLowerCase()) || [];
  const usaMontoOferta = metaVariablesMin.includes("montooferta");
  const usaDiasValidez = metaVariablesMin.includes("diasvalidez");

  const primerElegido = seleccionados[0];
  const preview = plantilla
    ? aplicarVariables(plantilla.mensaje, {
        nombre: primerElegido?.nombre || "(nombre del cliente)",
        patente: primerElegido?.patente || "(patente)",
        plan: primerElegido?.plan || "",
        fechaVencimiento: primerElegido?.vencimiento ? fmtFecha(primerElegido.vencimiento) : "",
        montoOferta,
        diasValidez,
        monto: "",
      })
    : "";

  const toggleCliente = (id: string) => {
    setExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    const r = await enviarMensajesMasivosWhatsapp({
      plantillaId,
      clienteIds: seleccionados.map((c) => c.id),
      montoOferta: usaMontoOferta && montoOferta ? Number(montoOferta) : undefined,
      diasValidez: usaDiasValidez && diasValidez ? Number(diasValidez) : undefined,
    });
    setEnviando(false);
    setResultado(r);
  };

  const confirmarEnvio = () => {
    if (!plantilla) {
      setErr("Elige una plantilla de WhatsApp");
      return;
    }
    if (!seleccionados.length) {
      setErr("No hay clientes seleccionados");
      return;
    }
    setErr(null);
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `Vas a enviar "${plantilla.nombre}" a ${seleccionados.length} cliente(s) por WhatsApp. Esta acción no se puede deshacer. ¿Confirmar?`,
        confirmLabel: "Enviar",
        danger: true,
        onConfirm: enviar,
      },
    });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Mensajes Únicos</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Envía un mensaje puntual por WhatsApp a un grupo de clientes filtrado en el momento — por ejemplo, avisar un
          cierre por mantención a todos los clientes con plan, u ofrecer un precio especial a los que tienen el plan
          vencido y no lo han renovado. Solo se puede enviar usando una plantilla con su template ya{" "}
          <strong>Aprobado en Meta</strong> (pestaña &quot;WhatsApp Webhooks&quot;): la mayoría de estos clientes no te
          han escrito en las últimas 24 horas, así que un mensaje de texto libre sería rechazado por WhatsApp.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="field" style={{ flex: 1, minWidth: 180, margin: 0 }}>
            <label>Estado del plan</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}>
              {FILTROS_ESTADO.map((f) => (
                <option key={f} value={f}>
                  {f === "todos" ? "Todos" : f}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label>Origen</label>
            <select value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value as FiltroOrigen)}>
              {FILTROS_ORIGEN.map((o) => (
                <option key={o} value={o}>
                  {o === "todos" ? "Todos" : o === "WEB" ? "Web" : "Local"}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180, margin: 0 }}>
            <label>Buscar por nombre o patente</label>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej: Juan o AB1234" />
          </div>
        </div>

        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5, margin: "0 0 6px" }}>
          Filtros por conducta de compra (para segmentar por comportamiento, no solo por estado del plan):
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div className="field" style={{ flex: 1, minWidth: 130, margin: 0 }}>
            <label>Pasadas totales, mín.</label>
            <input type="number" min={0} value={visitasMin} onChange={(e) => setVisitasMin(e.target.value)} placeholder="Ej: 5" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 130, margin: 0 }}>
            <label>Pasadas totales, máx.</label>
            <input type="number" min={0} value={visitasMax} onChange={(e) => setVisitasMax(e.target.value)} placeholder="Ej: 2" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
            <label>Sin venir hace al menos (días)</label>
            <input
              type="number"
              min={0}
              value={inactivoDiasMin}
              onChange={(e) => setInactivoDiasMin(e.target.value)}
              placeholder="Ej: 30"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
            <label>Cliente hace al menos (días)</label>
            <input
              type="number"
              min={0}
              value={clienteDesdeDiasMin}
              onChange={(e) => setClienteDesdeDiasMin(e.target.value)}
              placeholder="Ej: 90"
            />
          </div>
        </div>

        <div className="hint" style={{ textAlign: "left", fontSize: 13, marginBottom: 8 }}>
          {candidatos.length} cliente(s) coinciden con el filtro
          {sinTelefono > 0 ? ` (${sinTelefono} sin teléfono registrado, no se les puede enviar)` : ""} ·{" "}
          <strong>{seleccionados.length} seleccionado(s)</strong>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button type="button" className="icon-btn" onClick={() => setExcluidos(new Set())}>
            Seleccionar todos
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setExcluidos(new Set(seleccionables.map((c) => c.id)))}
          >
            Deseleccionar todos
          </button>
        </div>

        <ClientesSeleccionablesList candidatos={candidatos} excluidos={excluidos} onToggle={toggleCliente} />

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Plantilla de WhatsApp a enviar</label>
          <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
            <option value="">Elige una plantilla...</option>
            {data.plantillasWhatsapp
              .filter((p) => p.activo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </div>

        {plantilla && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <BadgeAprobadoMeta aprobado={plantilla.metaAprobado} />
            {!plantilla.metaNombre && (
              <span className="err" style={{ margin: 0 }}>
                Esta plantilla no tiene template de Meta configurado, no se puede enviar.
              </span>
            )}
          </div>
        )}

        {(usaMontoOferta || usaDiasValidez) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {usaMontoOferta && (
              <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
                <label>Monto de la oferta ({"{{montoOferta}}"})</label>
                <input type="number" min={0} value={montoOferta} onChange={(e) => setMontoOferta(e.target.value)} placeholder="Ej: 4990" />
              </div>
            )}
            {usaDiasValidez && (
              <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
                <label>Días de validez ({"{{diasValidez}}"})</label>
                <input type="number" min={1} value={diasValidez} onChange={(e) => setDiasValidez(e.target.value)} placeholder="Ej: 7" />
              </div>
            )}
          </div>
        )}

        {plantilla && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Vista previa (con el primer cliente seleccionado)</label>
            <textarea readOnly rows={4} value={preview} />
          </div>
        )}

        {err && <div className="err">{err}</div>}
        {resultado && (
          <div className="err" style={{ color: resultado.fallidos ? undefined : "var(--green)" }}>
            Enviado a {resultado.enviados} de {resultado.total} cliente(s).
            {resultado.fallidos ? ` ${resultado.fallidos} fallaron.` : ""}
            {resultado.sinTelefono ? ` ${resultado.sinTelefono} sin teléfono.` : ""}
          </div>
        )}

        <button className="btn" onClick={confirmarEnvio} disabled={enviando || !plantilla || !seleccionados.length}>
          {enviando ? "Enviando..." : `Enviar a ${seleccionados.length} cliente(s)`}
        </button>
      </div>
    </div>
  );
}
