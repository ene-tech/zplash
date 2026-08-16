"use client";

import { fmtCLP } from "@/lib/helpers";
import { CamposDocumento } from "./CamposDocumento";
import { useDatosDocumento } from "./useDatosDocumento";
import type { AccionServicio, DatosDocumento } from "./usePagarForm";

// Card que aparece bajo la grilla de Servicios puntuales al elegir uno
// (ver .service-btn en PagarForm): pide Boleta/Factura antes de cobrar,
// mismo patrón que el paso "documento" del flujo de Plan/Renovación (ver
// ResultadoBusqueda) y que PagoUnicoCard.
export function ServicioDocumentoCard({
  accionServicio,
  pagando,
  err,
  onCancelar,
  onConfirmar,
}: {
  accionServicio: AccionServicio;
  pagando: string | null;
  err: string;
  onCancelar: () => void;
  onConfirmar: (datosDocumento: DatosDocumento) => void;
}) {
  const doc = useDatosDocumento();

  function confirmar() {
    const datosDocumento = doc.validar();
    if (!datosDocumento) return;
    onConfirmar(datosDocumento);
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 6 }}>Vas a pagar:</p>
      <h3 style={{ marginBottom: 10 }}>
        {accionServicio.nombre} — {fmtCLP(accionServicio.precio)}
      </h3>
      <CamposDocumento d={doc} />
      <div className="err">{doc.error || err}</div>
      <button className="btn" onClick={confirmar} disabled={pagando !== null}>
        {pagando === accionServicio.id ? "Redirigiendo..." : "Pagar ahora"}
      </button>
      <button type="button" className="btn ghost" style={{ marginTop: 10 }} onClick={onCancelar} disabled={pagando !== null}>
        Cancelar
      </button>
    </div>
  );
}
