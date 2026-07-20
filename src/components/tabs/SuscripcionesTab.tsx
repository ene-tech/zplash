"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  cancelarSuscripcionOneclick,
  cobrarSuscripcionManual,
  listarSuscripcionesOneclick,
  reactivarSuscripcionOneclick,
  suspenderSuscripcionOneclick,
} from "@/lib/db";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import { fmtDate, normPlate } from "@/lib/helpers";

const ESTADO_LABEL: Record<string, string> = {
  activa: "Activa",
  suspendida: "Suspendida",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
};

const ESTADO_CLASE: Record<string, string> = {
  activa: "ok",
  suspendida: "warn",
  pendiente: "warn",
  cancelada: "bad",
};

// A diferencia de ClientesTab, esta lista no vive en AppData/commit(): se
// pide a demanda con listarSuscripcionesOneclick() y se recarga después de
// cada acción, mismo criterio que ya usa ClienteInfoModal para esta misma
// tabla (suscripciones_oneclick).
export default function SuscripcionesTab() {
  const { ui, patchUi } = useApp();
  const [suscripciones, setSuscripciones] = useState<SuscripcionOneclickInfo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");

  const cargar = () => {
    setCargando(true);
    listarSuscripcionesOneclick()
      .then(setSuscripciones)
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    listarSuscripcionesOneclick()
      .then(setSuscripciones)
      .finally(() => setCargando(false));
  }, []);

  const qPatente = normPlate(ui.search || "");
  const qNombre = (ui.search || "").toLowerCase().trim();
  let filtered = suscripciones.filter(
    (s) => !ui.search || normPlate(s.patente).includes(qPatente) || s.clienteNombre.toLowerCase().includes(qNombre)
  );
  if (filtroEstado !== "todos") {
    filtered = filtered.filter((s) => s.estado === filtroEstado);
  }

  const ejecutar = async (id: string, accion: () => Promise<unknown>) => {
    setProcesandoId(id);
    try {
      await accion();
      cargar();
    } finally {
      setProcesandoId(null);
    }
  };

  const cancelar = (s: SuscripcionOneclickInfo) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Cancelar la renovación automática de ${s.clienteNombre} (${s.patente})? Se elimina la tarjeta inscrita en Transbank y no se puede reactivar después.`,
        confirmLabel: "Cancelar suscripción",
        danger: true,
        onConfirm: () => ejecutar(s.id, () => cancelarSuscripcionOneclick(s.id)),
      },
    });
  };

  const suspender = (s: SuscripcionOneclickInfo) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Suspender la renovación automática de ${s.clienteNombre} (${s.patente})? Se pausan los cobros, pero la tarjeta queda inscrita y se puede reactivar después.`,
        confirmLabel: "Suspender",
        danger: false,
        onConfirm: () => ejecutar(s.id, () => suspenderSuscripcionOneclick(s.id)),
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre o patente..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <select style={{ maxWidth: 170 }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="activa">Activa</option>
          <option value="suspendida">Suspendida</option>
          <option value="pendiente">Pendiente</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Patente</th>
              <th>Cliente</th>
              <th>Tarjeta</th>
              <th>Estado</th>
              <th>Próximo cobro</th>
              <th>Último cobro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">Cargando...</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No hay suscripciones que coincidan</div>
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  <td className="plate-tag">{s.patente}</td>
                  <td>{s.clienteNombre}</td>
                  <td>{s.cardUltimosDigitos ? `${s.cardTipo || ""} ${s.cardUltimosDigitos}` : "-"}</td>
                  <td>
                    <span className={`status-pill ${ESTADO_CLASE[s.estado] || "warn"}`}>{ESTADO_LABEL[s.estado] || s.estado}</span>
                  </td>
                  <td>{s.proximoCobro ? fmtDate(s.proximoCobro) : "-"}</td>
                  <td>
                    {s.ultimoCobro ? `${s.ultimoCobro.estado === "aprobada" ? "Aprobado" : "Rechazado"} — ${fmtDate(s.ultimoCobro.fecha)}` : "-"}
                  </td>
                  <td className="row-actions">
                    {s.estado === "activa" && (
                      <>
                        {s.ultimoCobro?.estado === "rechazada" && (
                          <button
                            className="icon-btn"
                            disabled={procesandoId === s.id}
                            onClick={() => ejecutar(s.id, () => cobrarSuscripcionManual(s.id))}
                          >
                            Reintentar cobro
                          </button>
                        )}
                        <button className="icon-btn" disabled={procesandoId === s.id} onClick={() => suspender(s)}>
                          Suspender
                        </button>
                        <button className="icon-btn" disabled={procesandoId === s.id} onClick={() => cancelar(s)}>
                          Cancelar
                        </button>
                      </>
                    )}
                    {s.estado === "suspendida" && (
                      <>
                        <button
                          className="icon-btn"
                          disabled={procesandoId === s.id}
                          onClick={() => ejecutar(s.id, () => reactivarSuscripcionOneclick(s.id))}
                        >
                          Reactivar
                        </button>
                        <button className="icon-btn" disabled={procesandoId === s.id} onClick={() => cancelar(s)}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
