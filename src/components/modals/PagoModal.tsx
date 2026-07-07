"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import type { PagoInfo } from "@/types";

export default function PagoModal({
  monto,
  descripcion,
  onConfirm,
}: {
  monto: number;
  descripcion: string;
  onConfirm: (pago: PagoInfo) => void;
}) {
  const { patchUi } = useApp();
  const [metodo, setMetodo] = useState<"efectivo" | "tarjeta" | null>(null);
  const voucherRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");

  const confirmar = () => {
    if (!metodo) {
      setErr("Selecciona una forma de pago");
      return;
    }
    if (metodo === "tarjeta") {
      const voucher = voucherRef.current?.value.trim();
      if (!voucher) {
        setErr("Ingresa el código de voucher");
        return;
      }
      onConfirm({ metodo, voucher });
    } else {
      onConfirm({ metodo });
    }
    patchUi({ modal: null });
  };

  return (
    <div className="modal" style={{ maxWidth: 400 }}>
      <h3>Forma de pago</h3>
      <div style={{ color: "var(--white)", fontSize: 14, marginBottom: 12 }}>{descripcion}</div>
      <div style={{ fontWeight: 700, fontSize: 26, color: "var(--gold)", marginBottom: 18 }}>{fmtCLP(monto)}</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button
          className={metodo === "efectivo" ? "btn" : "btn ghost"}
          style={{ flex: 1, marginTop: 0 }}
          onClick={() => {
            setMetodo("efectivo");
            setErr("");
          }}
        >
          Efectivo
        </button>
        <button
          className={metodo === "tarjeta" ? "btn" : "btn ghost"}
          style={{ flex: 1, marginTop: 0 }}
          onClick={() => {
            setMetodo("tarjeta");
            setErr("");
          }}
        >
          Tarjeta
        </button>
      </div>
      {metodo === "tarjeta" && (
        <div className="field">
          <label>Código Voucher</label>
          <input ref={voucherRef} placeholder="N° de voucher" autoFocus />
        </div>
      )}
      <div className="err">{err}</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => patchUi({ modal: null })}>
          Cancelar
        </button>
        <button className="btn" onClick={confirmar}>
          Confirmar
        </button>
      </div>
    </div>
  );
}
