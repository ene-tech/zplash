"use client";

import { useState } from "react";
import Patente from "@/components/cliente/Patente";
import { fmtCLP } from "@/lib/helpers";
import { trackCompraMeta } from "@/lib/metaPixel";
import { redirigirAWebpay } from "@/lib/webpayClient";

// Botones de pago de /v/[codigo]. Con tarjeta guardada cobra con un toque
// (/api/v/[codigo]/pagar) y muestra la confirmación acá mismo; sin ella, o con
// "Pagar con otra tarjeta", va a Webpay con el código del link para que el
// descuento y el celular salgan de la ficha.
export default function PagoLinkSms({
  codigo,
  patente,
  precio,
  tarjeta,
}: {
  codigo: string;
  patente: string;
  precio: number;
  tarjeta?: { tipo: string; ultimos: string };
}) {
  const [pagando, setPagando] = useState<"tarjeta" | "webpay" | null>(null);
  const [err, setErr] = useState("");
  const [listo, setListo] = useState(false);

  async function pagarConTarjeta() {
    setErr("");
    setPagando("tarjeta");
    try {
      const res = await fetch(`/api/v/${codigo}/pagar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo cobrar la tarjeta");
      } else if (data.estado === "aprobada") {
        // El monto que ve el pixel es el del botón; el servidor (Conversions
        // API) lo vuelve a leer de la compra aprobada.
        if (data.buyOrder) trackCompraMeta(precio, data.buyOrder);
        setListo(true);
      } else {
        setErr("El banco rechazó el cobro. Prueba con otra tarjeta.");
      }
    } catch {
      setErr("Sin conexión. Revisa tu internet antes de volver a intentar.");
    }
    setPagando(null);
  }

  async function pagarConWebpay() {
    setErr("");
    setPagando("webpay");
    try {
      const res = await fetch("/api/pagos/webpay/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, codigoLink: codigo, items: [{ tipo: "lavado_unico" }] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo iniciar el pago");
        setPagando(null);
        return;
      }
      redirigirAWebpay(data.url, data.token);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setPagando(null);
    }
  }

  if (listo) {
    return (
      <div className="card link-sms-listo" role="status">
        <h3>Listo, quedó pagado</h3>
        <p className="hint">Tu lavado quedó cargado a tu patente.</p>
        <dl>
          <div>
            <dt>Patente</dt>
            <dd>
              <Patente patente={patente} />
            </dd>
          </div>
          <div>
            <dt>Lavado Full Túnel</dt>
            <dd>{fmtCLP(precio)}</dd>
          </div>
          {tarjeta && (
            <div>
              <dt>Tarjeta</dt>
              <dd>
                {tarjeta.tipo} ••{tarjeta.ultimos}
              </dd>
            </div>
          )}
        </dl>
        <p className="link-sms-local">
          <strong>En el local:</strong> solo di tu patente.
        </p>
      </div>
    );
  }

  return (
    <div className="link-sms-botones">
      {tarjeta ? (
        <>
          <button type="button" className="btn link-sms-btn" onClick={pagarConTarjeta} disabled={!!pagando}>
            {pagando === "tarjeta" ? "Cobrando..." : `Pagar ${fmtCLP(precio)}`}
            <small>
              con tu {tarjeta.tipo} terminada en {tarjeta.ultimos}
            </small>
          </button>
          <button type="button" className="link-sms-alt" onClick={pagarConWebpay} disabled={!!pagando}>
            {pagando === "webpay" ? "Redirigiendo..." : "Pagar con otra tarjeta"}
          </button>
        </>
      ) : (
        <button type="button" className="btn link-sms-btn" onClick={pagarConWebpay} disabled={!!pagando}>
          {pagando === "webpay" ? "Redirigiendo..." : `Pagar ${fmtCLP(precio)}`}
          <small>con tarjeta de débito o crédito</small>
        </button>
      )}
      <div className="err" role="alert">
        {err}
      </div>
    </div>
  );
}
