"use client";

import { useCallback, useSyncExternalStore } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "zplash_announce_descuento_dismissed";
const DISMISS_EVENT = "zplash:announce-dismissed";
// Mismo número que UbicacionTab (WHATSAPP_URL) + el keyword real que
// reconoce el bot (ver FAQ de full-tunnel: "descuento" + patente).
const WHATSAPP_URL = "https://wa.me/56957969446?text=descuento";

// Mismo patrón que useCarrito.ts (useSyncExternalStore sobre localStorage)
// en vez de leer localStorage en un useEffect + setState: evita el flash de
// hidratación mal manejado y la regla react-hooks/set-state-in-effect.
function subscribe(callback: () => void) {
  window.addEventListener(DISMISS_EVENT, callback);
  return () => window.removeEventListener(DISMISS_EVENT, callback);
}
function getSnapshot() {
  return localStorage.getItem(DISMISS_KEY) === "1";
}
function getServerSnapshot() {
  return false;
}

// Banner de bienvenida arriba del SiteNav, en la landing. Adaptado de un
// template de Tailwind Plus: se sacaron los blobs decorativos rosa/violeta
// (no son de marca) y se cambió el dismiss in-memory por uno persistido en
// localStorage, para que no vuelva a aparecer en cada visita.
export default function AnnounceBar() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, []);

  if (dismissed) return null;

  return (
    <div className="announce-bar">
      <p className="announce-bar-text">
        <strong>¿Primera vez en Zplash?</strong>
        <span className="announce-bar-dot" aria-hidden="true" />
        Escríbenos &quot;descuento&quot; + tu patente por WhatsApp y recibe un código válido por 7 días.
      </p>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="announce-bar-cta">
        Escribir por WhatsApp <span aria-hidden="true">→</span>
      </a>
      <button type="button" className="announce-bar-close" onClick={dismiss}>
        <span className="sr-only">Cerrar</span>
        <X />
      </button>
    </div>
  );
}
