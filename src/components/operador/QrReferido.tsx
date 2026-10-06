"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { fmtCLP } from "@/lib/helpers";
import { linkReferido, mensajeInvitacionReferido } from "@/lib/referidos";

// Programa de referidos desde el mesón (ver @/lib/referidos): el cliente
// escanea y se le abre WhatsApp con la invitación ya escrita — su link
// zplash.cl/?ref=PATENTE — para reenviarla a sus contactos. Es el mismo
// mensaje del botón "Enviar por WhatsApp" de Mi Cuenta, sin que tenga que
// entrar a su cuenta.
export default function QrReferido({ patente, valor }: { patente: string; valor: number }) {
  const [abierto, setAbierto] = useState(false);
  if (!patente || !valor) return null;
  const monto = fmtCLP(valor);
  const mensaje = mensajeInvitacionReferido(linkReferido(window.location.origin, patente), monto);
  const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  return (
    <div className="offer-card" style={{ marginTop: 16 }}>
      <div className="offer-head">
        <h4>
          Regala {monto}, gana {monto}
        </h4>
      </div>
      <div className="msg">
        Cuéntale: si comparte su código <span className="plate-tag">{patente}</span> por WhatsApp, cada amigo recibe{" "}
        {monto} de descuento en su primer lavado y, cuando lo usa, a esta patente le queda {monto} para su próximo pago
        — sin límite de amigos. Que escanee el QR con la cámara: se le abre WhatsApp con la invitación lista para enviar.
      </div>
      {abierto && (
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ background: "#fff", padding: 12, borderRadius: 8, display: "inline-block" }}>
            <QRCodeSVG value={url} size={220} />
          </div>
        </div>
      )}
      <button className="btn secondary" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cerrar QR" : "Mostrar QR para invitar amigos"}
      </button>
    </div>
  );
}
