"use client";

import { useState } from "react";
import { fmtCLP, isValidPatente, normPlate } from "@/lib/helpers";
import { redirigirAWebpay } from "@/lib/webpayClient";
import { useCarrito } from "@/hooks/useCarrito";
import VolverBoton from "@/components/cliente/VolverBoton";

export default function CarritoPage() {
  const { items, total, quitar, vaciar } = useCarrito();
  const [patente, setPatente] = useState("");
  const [err, setErr] = useState("");
  const [pagando, setPagando] = useState(false);

  async function pagarTodo() {
    const p = normPlate(patente);
    if (!isValidPatente(p)) {
      setErr("Patente inválida. Ej: AB1234 o ABCD12.");
      return;
    }
    setErr("");
    setPagando(true);
    try {
      const res = await fetch("/api/pagos/webpay/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patente: p,
          items: items.map((i) => ({ tipo: i.tipo, servicioId: i.servicioId })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo iniciar el pago");
        setPagando(false);
        return;
      }
      vaciar();
      redirigirAWebpay(data.url, data.token);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setPagando(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <VolverBoton href="/cliente" label="Volver a Tipos de Lavados" />
      <h2 style={{ marginBottom: 18 }}>🛒 Tu carrito</h2>

      {items.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 14 }}>Tu carrito está vacío.</p>
          <a href="/cliente" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
            Ver tipos de lavado
          </a>
        </div>
      ) : (
        <>
          {items.map((item) => (
            <div className="card" style={{ marginBottom: 12 }} key={item.key}>
              <div className="price-row" style={{ marginBottom: 0, justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.nombre}</div>
                  <span className="new">{fmtCLP(item.precio)}</span>
                </div>
                <button type="button" className="btn ghost" style={{ marginTop: 0 }} onClick={() => quitar(item.key)}>
                  Quitar
                </button>
              </div>
            </div>
          ))}

          <div className="card" style={{ marginTop: 4, marginBottom: 18 }}>
            <div className="price-row" style={{ marginBottom: 0, justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span className="new">{fmtCLP(total)}</span>
            </div>
          </div>

          <div className="card">
            <label style={{ display: "block", marginBottom: 8 }}>Patente</label>
            <input
              className="plate-input"
              value={patente}
              onChange={(e) => setPatente(e.target.value.toUpperCase())}
              placeholder="AB1234"
              maxLength={6}
              style={{ marginBottom: 10 }}
            />
            <div className="err">{err}</div>
            <button className="btn" onClick={pagarTodo} disabled={pagando}>
              {pagando ? "Redirigiendo..." : `Pagar todo — ${fmtCLP(total)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
