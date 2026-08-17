"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDescartable } from "@/hooks/useDescartable";
import { fmtCLP } from "@/lib/helpers";

const DISMISS_KEY = "zplash_popup_descuento_bienvenida";
// El pop-up no salta encima del primer pantallazo: aparece cuando el visitante
// ya alcanzó a ver de qué se trata el sitio. Se descarta para siempre
// (localStorage, no sessionStorage): quien lo cerró o ya canjeó no tiene por
// qué volver a verlo en cada visita.
const DELAY_MS = 3500;

type Emitido = { codigo: string; valor: number; fechaCaducidad: string; correoEnviado: boolean };

// Captura de clientes nuevos en la landing: patente + correo a cambio del
// descuento de primera vez (el mismo de la Opción 5 del bot de WhatsApp, ver
// /api/cliente/descuento-bienvenida). `valor`/`dias` llegan desde el server
// para que el texto no se desincronice del cupón que se emite de verdad.
export default function DescuentoBienvenidaModal({ valor, dias }: { valor: number; dias: number }) {
  const [descartado, descartar] = useDescartable(DISMISS_KEY);
  const [listo, setListo] = useState(false);
  const [patente, setPatente] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const [emitido, setEmitido] = useState<Emitido | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setListo(true), DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  async function enviar() {
    setErr("");
    setEnviando(true);
    try {
      const res = await fetch("/api/cliente/descuento-bienvenida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data.error || "No pudimos generar tu descuento, intenta de nuevo.");
        return;
      }
      setEmitido(data);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={listo && !descartado} onOpenChange={(open) => !open && descartar()}>
      <DialogContent className="promo-popup p-0 gap-0 overflow-hidden">
        <div className="promo-popup-foto" />

        <div className="promo-popup-cuerpo">
          {emitido ? (
            <>
              {/* El mensaje vende lo que de verdad pasa: el cupón queda atado
                  a la patente, así que el operador lo ve solo al escanear (ver
                  OperadorFoundResult) y el cliente no tiene que hacer nada. El
                  código va abajo y en chico, como respaldo, no como instrucción. */}
              <DialogHeader>
                <DialogTitle style={{ color: "var(--gold)" }}>¡Listo! Ya tenemos tu patente</DialogTitle>
                <DialogDescription>
                  Ahora solo llegar y pasar: aplicamos tus {fmtCLP(emitido.valor)} de descuento de forma automática en tu próxima
                  visita.
                  {emitido.correoEnviado
                    ? ` Te mandamos el detalle a ${email}.`
                    : " No alcanzamos a enviarte el correo, pero el descuento ya quedó guardado."}
                </DialogDescription>
              </DialogHeader>
              <p className="promo-popup-codigo">{emitido.codigo}</p>
              <p className="hint" style={{ textAlign: "center" }}>
                Tu código de respaldo · vence el {new Date(emitido.fechaCaducidad).toLocaleDateString("es-CL")}
              </p>
              <button type="button" className="btn" style={{ width: "100%" }} onClick={descartar}>
                Entendido
              </button>
            </>
          ) : (
            <>
              <DialogHeader>
                {/* El monto va en su propio <span> y no como título completo
                    para poder agrandarlo sin arrastrar el resto de la frase:
                    es el gancho, tiene que leerse de una. */}
                <DialogTitle>
                  <span className="promo-popup-monto">{fmtCLP(valor)}</span>
                  <span className="promo-popup-subtitulo">de descuento en tu primer lavado</span>
                </DialogTitle>
                <DialogDescription>
                  ¿Primera vez en ZPlash? Deja tu patente y tu correo y te mandamos el descuento — válido por {dias} días.
                </DialogDescription>
              </DialogHeader>

              <div className="field">
                <label htmlFor="promo-patente">Patente</label>
                <input
                  id="promo-patente"
                  value={patente}
                  onChange={(e) => setPatente(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  placeholder="AB1234"
                  maxLength={6}
                  autoComplete="off"
                  style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}
                />
              </div>

              <div className="field">
                <label htmlFor="promo-email">Correo</label>
                <input
                  id="promo-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div className="err">{err}</div>
              <button type="button" className="btn" style={{ width: "100%", marginTop: 4 }} onClick={enviar} disabled={enviando}>
                {enviando ? "Generando..." : "Quiero mi descuento"}
              </button>
              <button type="button" className="promo-popup-descartar" onClick={descartar}>
                No, gracias
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
