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

// Glyph de WhatsApp (no viene en lucide-react, que solo trae íconos
// genéricos) — necesario para que el botón siga siendo reconocible al
// reducirlo a ícono solo en mobile, sin el texto "Escribir por WhatsApp".
function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.888.52 3.657 1.427 5.17L2 22l4.964-1.393A9.953 9.953 0 0 0 12.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm0 18.13a8.11 8.11 0 0 1-4.13-1.13l-.296-.176-2.947.827.79-2.87-.192-.295A8.106 8.106 0 0 1 3.87 12c0-4.484 3.648-8.13 8.131-8.13 4.483 0 8.13 3.646 8.13 8.13 0 4.484-3.647 8.13-8.13 8.13z" />
    </svg>
  );
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
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="announce-bar-cta" aria-label="Escribir por WhatsApp">
        <WhatsAppIcon className="announce-bar-cta-icon" />
        <span className="announce-bar-cta-label">
          Escribir por WhatsApp <span aria-hidden="true">→</span>
        </span>
      </a>
      <button type="button" className="announce-bar-close" onClick={dismiss}>
        <span className="sr-only">Cerrar</span>
        <X />
      </button>
    </div>
  );
}
