"use client";

import { useState } from "react";

// Copia al portapapeles y confirma en el propio botón por 1,5s.
export function BotonCopiar({ texto, deshabilitado }: { texto: string; deshabilitado?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <button type="button" className="icon-btn" onClick={copiar} disabled={deshabilitado || !texto}>
      {copiado ? "¡Copiado!" : "Copiar"}
    </button>
  );
}
