"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDescartable } from "@/hooks/useDescartable";

// Espacio publicitario de Mi Cuenta: se abre solo al entrar a la cuenta. Para
// cambiar la campaña se edita AVISO y punto — junto con la clave, así el que
// ya cerró el aviso anterior igual ve el nuevo. AVISO = null lo apaga sin
// tocar MiCuentaTab. Se descarta por sesión de navegador (no para siempre):
// es publicidad recurrente, tiene que volver en el próximo ingreso.
const AVISO: { clave: string; titulo: string; detalle: string; cta: string } | null = {
  clave: "zplash_promo_precio_plan_2026_08",
  titulo: "No pierdas tu precio de Plan",
  detalle: "Paga tu plan antes del vencimiento y te respetamos el valor.",
  cta: "Entendido",
};

export function PromoModal() {
  const [descartado, descartar] = useDescartable(AVISO?.clave ?? "", true);

  if (!AVISO) return null;

  return (
    <Dialog open={!descartado} onOpenChange={(open) => !open && descartar()}>
      {/* Padding inline y no la clase p-4 del DialogContent: el reset
          `* { padding: 0 }` de globals.css no está en capa, así que le gana a
          las utilidades de Tailwind y el texto quedaba pegado al borde. */}
      <DialogContent style={{ padding: 20 }}>
        <DialogHeader>
          <DialogTitle className="text-xl leading-snug" style={{ color: "var(--gold)" }}>
            {AVISO.titulo}
          </DialogTitle>
          <DialogDescription className="text-base">{AVISO.detalle}</DialogDescription>
        </DialogHeader>
        <button type="button" className="btn" style={{ marginTop: 0, width: "100%" }} onClick={descartar}>
          {AVISO.cta}
        </button>
      </DialogContent>
    </Dialog>
  );
}
