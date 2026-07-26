"use client";

import { useRef } from "react";
import { useApp } from "@/context/AppContext";
import { normPlate, todayStr } from "@/lib/helpers";
import Topbar from "@/components/Topbar";
import OperadorResult from "@/components/OperadorResult";
import TodayLog from "@/components/TodayLog";
import { useOperadorScanPanel } from "@/components/operador/useOperadorScanPanel";

export default function OperadorView() {
  const { data, ui, patchUi, logout } = useApp();
  const hoy = todayStr();
  const ingresosHoy = data.ingresos.filter((i) => new Date(i.fecha).toDateString() === hoy).length;
  const plateInputRef = useRef<HTMLInputElement>(null);
  const fotoPatenteRef = useRef<HTMLInputElement>(null);
  const codigoCuponRef = useRef<HTMLInputElement>(null);
  const scan = useOperadorScanPanel({ plateInputRef, codigoCuponRef });

  return (
    <>
      <Topbar
        mode={`Operador · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout({ operResult: null, loginMode: null })}
        onBack={() => patchUi({ view: "hub", operResult: null })}
      />
      <div className="content">
        <div className="stat-card" style={{ width: "fit-content", margin: "0 auto 20px", textAlign: "center" }}>
          <div className="num">{ingresosHoy}</div>
          <div className="lbl">Autos ingresados hoy</div>
        </div>
        {scan.bloqueado ? (
          <div className="scan-panel">
            <h2>Registro fuera de horario</h2>
            <div className="hint">
              El registro de vehículos está habilitado de {scan.cfg.horarioOperadorSemanaInicio} a {scan.cfg.horarioOperadorSemanaFin} hrs
              (lunes a viernes) y de {scan.cfg.horarioOperadorFindeInicio} a {scan.cfg.horarioOperadorFindeFin} hrs (sábado, domingo y
              festivos). Contacta a Administración o Gerencia si necesitas registrar un ingreso fuera de este horario.
            </div>
          </div>
        ) : (
          <>
            <div className="scan-panel">
              <h2>Validar patente</h2>
              <div className="hint">Ingresa la patente del vehículo para registrar el ingreso</div>
              <input
                ref={plateInputRef}
                className="plate-input"
                placeholder="AB1234"
                maxLength={8}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") scan.doValidate();
                }}
              />
              <div className="field" style={{ maxWidth: 340, margin: "10px auto 0" }}>
                <input
                  ref={codigoCuponRef}
                  className="plate-input"
                  style={{ fontSize: 14 }}
                  placeholder="Código de cupón (opcional)"
                  maxLength={8}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") scan.doValidate();
                  }}
                />
              </div>
              <br />
              <input
                ref={fotoPatenteRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={scan.escanearPatente}
              />
              <button
                className="btn ghost"
                style={{ marginTop: 10 }}
                disabled={scan.escaneando}
                onClick={() => fotoPatenteRef.current?.click()}
              >
                {scan.escaneando ? "Leyendo patente..." : "📷 Escanear patente"}
              </button>
              <div className="hint" style={{ marginTop: 4 }}>
                Acércate para que la patente ocupe gran parte de la foto
              </div>
              <br />
              {scan.plateErr && <div className="err">{scan.plateErr}</div>}
              <button className="btn" onClick={scan.doValidate}>
                Validar
              </button>
              <br />
              <button
                className="btn ghost"
                style={{ marginTop: 10 }}
                onClick={() =>
                  patchUi({
                    modal: {
                      type: "client",
                      data: null,
                      contexto: "operador",
                      patenteInicial: normPlate(plateInputRef.current?.value || ""),
                    },
                  })
                }
              >
                + Agregar vehículo nuevo
              </button>
              {scan.cuponErr && (
                <div className="err" style={{ color: scan.cuponErr.ok ? "var(--green)" : undefined, marginTop: 10 }}>
                  {scan.cuponErr.msg}
                </div>
              )}
            </div>
            <OperadorResult clearPlate={scan.clearPlate} codigoDescuento={scan.codigoDescuento} />
          </>
        )}
        <div className="today-log">
          <h3>ÚLTIMOS 10 INGRESOS</h3>
          <TodayLog />
        </div>
      </div>
    </>
  );
}
