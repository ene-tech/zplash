"use client";

import { useApp } from "@/context/AppContext";
import { fmtFecha } from "@/lib/helpers";

/** Mi contrato, de solo lectura. La ficha la llena Administración desde
 * Gestión de Equipo (ver EquipoView). */
export default function ContratoTab() {
  const { data, ui } = useApp();
  const perfil = ui.perfilActual;
  const miContrato = data.contratosFuncionario.find((c) => c.id === perfil?.id);

  if (!perfil) return <div className="empty">Sesión no válida</div>;

  return (
    <div>
      <h3>Mi contrato</h3>
      {miContrato ? (
        <div className="info-grid">
          <div className="k">Cargo</div>
          <div className="v">{miContrato.cargo}</div>
          <div className="k">Tipo de contrato</div>
          <div className="v">{miContrato.tipoContrato}</div>
          <div className="k">Jornada</div>
          <div className="v">{miContrato.jornadaHorasSemana ? `${miContrato.jornadaHorasSemana} h semanales` : "-"}</div>
          <div className="k">Inicio</div>
          <div className="v">{fmtFecha(miContrato.fechaInicio)}</div>
          <div className="k">Término</div>
          <div className="v">{miContrato.fechaTermino ? fmtFecha(miContrato.fechaTermino) : "Sin fecha de término"}</div>
          <div className="k">Documento</div>
          <div className="v">
            {miContrato.documentoUrl ? (
              <a href={miContrato.documentoUrl} target="_blank" rel="noopener noreferrer">
                Ver contrato firmado
              </a>
            ) : (
              "-"
            )}
          </div>
          {miContrato.notas && (
            <>
              <div className="k">Notas</div>
              <div className="v">{miContrato.notas}</div>
            </>
          )}
        </div>
      ) : (
        <div className="empty">Todavía no hay un contrato registrado a tu nombre. Consúltalo con Administración.</div>
      )}
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 10 }}>
        Esta ficha es referencial: la remuneración y los anexos no se registran acá, los ve Administración.
      </div>
    </div>
  );
}
