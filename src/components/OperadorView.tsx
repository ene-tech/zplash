"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { PATENTE_FORMATO_MSG, findClient, isValidPatente, normPlate } from "@/lib/helpers";
import Topbar from "@/components/Topbar";
import OperadorResult from "@/components/OperadorResult";
import TodayLog from "@/components/TodayLog";
import type { Ingreso } from "@/types";

export default function OperadorView() {
  const { data, ui, commit, patchUi } = useApp();
  const plateInputRef = useRef<HTMLInputElement>(null);
  const codigoCuponRef = useRef<HTMLInputElement>(null);
  const patenteCuponRef = useRef<HTMLInputElement>(null);
  const [cuponErr, setCuponErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [plateErr, setPlateErr] = useState("");

  const clearPlate = () => {
    if (plateInputRef.current) plateInputRef.current.value = "";
  };

  const doValidate = () => {
    const plate = plateInputRef.current?.value.trim();
    if (!plate) return;
    if (!isValidPatente(plate)) {
      setPlateErr(PATENTE_FORMATO_MSG);
      return;
    }
    setPlateErr("");
    const c = findClient(data.clientes, plate);
    patchUi({ operResult: c ? { found: true, cliente: c } : { found: false, plate } });
  };

  const canjearCupon = async () => {
    const codigo = (codigoCuponRef.current?.value.trim() || "").toUpperCase();
    const patente = normPlate(patenteCuponRef.current?.value || "");
    if (!codigo || !patente) {
      setCuponErr({ msg: "Ingresa el código del cupón y la patente", ok: false });
      return;
    }
    if (!isValidPatente(patente)) {
      setCuponErr({ msg: PATENTE_FORMATO_MSG, ok: false });
      return;
    }
    const cupon = data.cupones.find((c) => c.codigo === codigo);
    if (!cupon) {
      setCuponErr({ msg: "Código no encontrado", ok: false });
      return;
    }
    if (cupon.usado) {
      setCuponErr({ msg: "Este cupón ya fue usado", ok: false });
      return;
    }
    if (new Date(cupon.fechaCaducidad) < new Date()) {
      setCuponErr({ msg: "Este cupón está caducado", ok: false });
      return;
    }

    const ahora = new Date().toISOString();
    const cuponActualizado = {
      ...cupon,
      usado: true,
      patenteUso: patente,
      fechaUso: ahora,
      operadorUso: ui.perfilActual?.nombre || "",
    };
    const nombreIngreso = `Cupón · ${cupon.nombreLote} (${cupon.numeroLote}/${cupon.totalLote})`;
    const ingreso: Ingreso = {
      id: "i" + Date.now(),
      clienteId: "",
      patente,
      nombre: nombreIngreso,
      fecha: ahora,
      planEstadoAlIngreso: "ok",
      operador: ui.perfilActual?.nombre || "",
      viaCupon: true,
      cuponCodigo: cupon.codigo,
    };

    // El monto del lote ya se registro completo en el cierre de caja al
    // generar los cupones, asi que canjear uno no vuelve a cobrar nada.
    const ok = await commit({
      cupones: data.cupones.map((x) => (x.id === cupon.id ? cuponActualizado : x)),
      ingresos: [ingreso, ...data.ingresos],
    });
    if (!ok) {
      setCuponErr({ msg: "No se pudo registrar el canje (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setCuponErr({ msg: `Cupón canjeado para ${patente} (${cupon.nombreLote})`, ok: true });
    if (codigoCuponRef.current) codigoCuponRef.current.value = "";
    if (patenteCuponRef.current) patenteCuponRef.current.value = "";
  };

  return (
    <>
      <Topbar
        mode={`Operador · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => patchUi({ view: "login", operResult: null, perfilActual: null, perfilSeleccionadoId: null, loginMode: null })}
        onBack={() => patchUi({ view: "hub", operResult: null })}
      />
      <div className="content">
        <div className="stat-card" style={{ width: "fit-content", margin: "0 auto 20px", textAlign: "center" }}>
          <div className="num">{data.ingresos.length}</div>
          <div className="lbl">Autos ingresados en total</div>
        </div>
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
              if (e.key === "Enter") doValidate();
            }}
          />
          <br />
          {plateErr && <div className="err">{plateErr}</div>}
          <button className="btn" onClick={doValidate}>
            Validar
          </button>
          <br />
          <button
            className="btn ghost"
            style={{ marginTop: 10 }}
            onClick={() => patchUi({ modal: { type: "client", data: null, contexto: "operador" } })}
          >
            + Agregar vehículo nuevo
          </button>
        </div>
        <OperadorResult clearPlate={clearPlate} />
        <div className="scan-panel" style={{ marginTop: 24 }}>
          <h2>Canjear cupón</h2>
          <div className="hint">Ingresa el código del cupón (Venta Empresa) y la patente del vehículo que lo usa</div>
          <div className="field" style={{ maxWidth: 340, margin: "0 auto 10px" }}>
            <input
              ref={codigoCuponRef}
              className="plate-input"
              style={{ fontSize: 20, letterSpacing: "0.1em" }}
              placeholder="CÓDIGO"
              maxLength={8}
            />
          </div>
          <div className="field" style={{ maxWidth: 340, margin: "0 auto 10px" }}>
            <input
              ref={patenteCuponRef}
              className="plate-input"
              placeholder="Patente AB1234"
              maxLength={8}
              onKeyDown={(e) => {
                if (e.key === "Enter") canjearCupon();
              }}
            />
          </div>
          {cuponErr && (
            <div className="err" style={{ color: cuponErr.ok ? "var(--green)" : undefined }}>
              {cuponErr.msg}
            </div>
          )}
          <button className="btn" onClick={canjearCupon}>
            Canjear cupón
          </button>
        </div>
        <div className="today-log">
          <h3>Ingresos de hoy</h3>
          <TodayLog />
        </div>
      </div>
    </>
  );
}
