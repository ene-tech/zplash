"use client";

import { useState } from "react";
import { fmtFecha, parsearPatentes } from "@/lib/helpers";
import type { VehiculoSesion } from "@/lib/sesionCliente";
import type { CuponCuenta } from "./TicketsYCuponesSection";

// Gestión de los Pack de Tickets 10/+ de la cuenta (los cupones con loteId,
// ver /api/cliente/mi-cuenta): por lote, reglas de patente (para el lote
// entero o un ticket puntual, POST /regla-patentes) e informe de uso en Excel.
// La regla es cupones.patentesAutorizadas, la misma que valida el mesón.

type Objetivo = { loteId: string } | { codigo: string };

function estadoClase(estado: string): "ok" | "warn" | "bad" {
  if (estado === "Usado") return "ok";
  if (estado === "Caducado") return "bad";
  return "warn";
}

const editable = (c: CuponCuenta) => c.estado === "Disponible";
const textoRegla = (patentes: string[]) => (patentes.length ? patentes.join(", ") : "Cualquier patente");

/** Resumen de la regla de un lote: la de sus tickets sin usar si todos tienen la misma. */
function reglaDelLote(tickets: CuponCuenta[]): string {
  const vivos = tickets.filter(editable);
  if (!vivos.length) return "Sin tickets disponibles";
  const reglas = new Set(vivos.map((t) => textoRegla(t.patentesAutorizadas)));
  return reglas.size === 1 ? [...reglas][0] : "Distinta según el ticket";
}

async function descargarInforme(nombreLote: string, tickets: CuponCuenta[]) {
  const XLSX = await import("xlsx");
  const filas = tickets.map((t) => ({
    "N°": `${t.numeroLote}/${t.totalLote}`,
    Código: t.codigo,
    Estado: t.estado,
    "Patentes autorizadas": textoRegla(t.patentesAutorizadas),
    "Patente de uso": t.estado === "Usado" ? t.patente || "" : "",
    "Fecha de uso": t.fechaUso ? new Date(t.fechaUso).toLocaleString("es-CL") : "",
    Vence: fmtFecha(t.fechaCaducidad),
  }));
  const usados = tickets.filter((t) => t.estado === "Usado").length;
  const resumen = [
    { Dato: "Lote", Valor: nombreLote },
    { Dato: "Tickets", Valor: tickets.length },
    { Dato: "Usados", Valor: usados },
    { Dato: "Disponibles", Valor: tickets.filter(editable).length },
    { Dato: "Caducados", Valor: tickets.filter((t) => t.estado === "Caducado").length },
    { Dato: "Generado", Valor: new Date().toLocaleString("es-CL") },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Tickets");
  const archivo = nombreLote.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "tickets";
  XLSX.writeFile(wb, `Informe ${archivo}.xlsx`);
}

function EditorRegla({
  titulo,
  inicial,
  objetivo,
  vehiculos,
  onListo,
}: {
  titulo: string;
  inicial: string[];
  objetivo: Objetivo;
  vehiculos: VehiculoSesion[];
  onListo: (guardado: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(inicial.length === 0);
  const [texto, setTexto] = useState(inicial.join(", "));
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");

  async function guardar() {
    setErr("");
    const patentes = abierto ? [] : parsearPatentes(texto);
    if (!abierto && !patentes.length) {
      setErr("Ingresa al menos una patente, o deja el ticket abierto a cualquier patente");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/cliente/mi-cuenta/regla-patentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...objetivo, patentes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error || "No se pudo guardar");
        setGuardando(false);
        return;
      }
      onListo(true);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ margin: "10px 0" }}>
      <strong style={{ display: "block", marginBottom: 8 }}>{titulo}</strong>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className={abierto ? "btn" : "btn ghost"} style={{ flex: 1, marginTop: 0 }} onClick={() => setAbierto(true)}>
          Cualquier patente
        </button>
        <button type="button" className={!abierto ? "btn" : "btn ghost"} style={{ flex: 1, marginTop: 0 }} onClick={() => setAbierto(false)}>
          Solo estas patentes
        </button>
      </div>
      {!abierto && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Patentes (una por línea o separadas por coma)</label>
          {vehiculos.length > 0 && (
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 0, marginBottom: 8, padding: "6px 10px", fontSize: 12.5 }}
              onClick={() => {
                const todas = [...parsearPatentes(texto), ...vehiculos.map((v) => v.patente)];
                setTexto(todas.filter((p, i, arr) => arr.indexOf(p) === i).join(", "));
              }}
            >
              Cargar mis patentes registradas ({vehiculos.length})
            </button>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"AB1234\nCD5678"}
            rows={3}
            style={{ textTransform: "uppercase" }}
          />
        </div>
      )}
      <div className="err">{err}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar regla"}
        </button>
        <button type="button" className="btn ghost" onClick={() => onListo(false)} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function LoteCard({
  loteId,
  tickets,
  vehiculos,
  onCambio,
}: {
  loteId: string;
  tickets: CuponCuenta[];
  vehiculos: VehiculoSesion[];
  onCambio: () => void;
}) {
  // "lote" = editor del lote entero; un código = editor de ese ticket.
  const [editando, setEditando] = useState<string | null>(null);
  const nombre = tickets[0].nombreLote;
  const usados = tickets.filter((t) => t.estado === "Usado").length;
  const disponibles = tickets.filter(editable);
  const listo = (guardado: boolean) => {
    setEditando(null);
    if (guardado) onCambio();
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h4 style={{ margin: "0 0 4px" }}>{nombre}</h4>
          <div style={{ color: "var(--gray)", fontSize: 13 }}>
            {usados} usados · {disponibles.length} disponibles · de {tickets.length} · vence{" "}
            {fmtFecha(tickets[0].fechaCaducidad)}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Regla de patentes: <strong>{reglaDelLote(tickets)}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {disponibles.length > 0 && (
            <button type="button" className="btn ghost" style={{ marginTop: 0 }} onClick={() => setEditando("lote")}>
              Reglas del lote
            </button>
          )}
          <button type="button" className="btn ghost" style={{ marginTop: 0 }} onClick={() => descargarInforme(nombre, tickets)}>
            Descargar informe
          </button>
        </div>
      </div>

      {editando === "lote" && (
        <EditorRegla
          titulo={`Regla para los ${disponibles.length} tickets disponibles (reemplaza las reglas por ticket)`}
          inicial={disponibles.length && reglaDelLote(tickets) !== "Distinta según el ticket" ? disponibles[0].patentesAutorizadas : []}
          objetivo={{ loteId }}
          vehiculos={vehiculos}
          onListo={listo}
        />
      )}

      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Estado</th>
              <th>Patentes autorizadas</th>
              <th>Patente de uso</th>
              <th>Fecha de uso</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.codigo}>
                <td>
                  <span className="plate-tag">{t.codigo}</span>
                  <div style={{ color: "var(--gray)", fontSize: 12 }}>
                    N° {t.numeroLote}/{t.totalLote}
                  </div>
                </td>
                <td>
                  <span className={`status-pill ${estadoClase(t.estado)}`}>{t.estado}</span>
                </td>
                <td>
                  {textoRegla(t.patentesAutorizadas)}
                  {editable(t) && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
                      onClick={() => setEditando(t.codigo)}
                      aria-label={`Cambiar regla del ticket ${t.codigo}`}
                    >
                      Cambiar
                    </button>
                  )}
                </td>
                <td>{t.estado === "Usado" ? t.patente || "-" : "-"}</td>
                <td>{t.fechaUso ? new Date(t.fechaUso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && editando !== "lote" && (
        <EditorRegla
          key={editando}
          titulo={`Regla del ticket ${editando}`}
          inicial={tickets.find((t) => t.codigo === editando)?.patentesAutorizadas || []}
          objetivo={{ codigo: editando }}
          vehiculos={vehiculos}
          onListo={listo}
        />
      )}
    </div>
  );
}

export function PacksTicketsGestion({
  cupones,
  vehiculos,
  onCambio,
}: {
  cupones: CuponCuenta[];
  vehiculos: VehiculoSesion[];
  onCambio: () => void;
}) {
  const lotes = new Map<string, CuponCuenta[]>();
  for (const c of cupones) {
    if (!c.loteId) continue;
    lotes.set(c.loteId, [...(lotes.get(c.loteId) || []), c]);
  }
  if (!lotes.size) return null;

  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={{ margin: "0 0 6px" }}>Mis packs de tickets</h3>
      <p style={{ color: "var(--gray)", fontSize: 13.5, margin: "0 0 12px" }}>
        Decide qué patentes pueden usar cada ticket y descarga el informe de uso de cada lote.
      </p>
      {[...lotes].map(([loteId, tickets]) => (
        <LoteCard
          key={loteId}
          loteId={loteId}
          tickets={[...tickets].sort((a, b) => a.numeroLote - b.numeroLote)}
          vehiculos={vehiculos}
          onCambio={onCambio}
        />
      ))}
    </div>
  );
}
