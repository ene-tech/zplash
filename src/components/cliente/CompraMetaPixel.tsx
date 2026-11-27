"use client";

import { useEffect } from "react";
import { trackCompraMeta } from "@/lib/metaPixel";

/** Manda el Purchase al pixel de Meta desde /pagar/resultado. El monto lo
 * lee la página desde la base (nunca de la URL). Si el visitante no aceptó
 * cookies el pixel no está cargado y esto no hace nada. */
export default function CompraMetaPixel({ valor, buyOrder }: { valor: number; buyOrder: string }) {
  useEffect(() => {
    trackCompraMeta(valor, buyOrder);
  }, [valor, buyOrder]);
  return null;
}
