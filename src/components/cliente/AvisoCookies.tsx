"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  analiticaDisponible,
  EVENTO_PREFERENCIAS_COOKIES,
  guardarConsentimiento,
  leerConsentimiento,
  type Consentimiento,
} from "@/lib/analitica";

const EVENTO_DECIDIO = "zplash:consentimiento-cookies";

// "Preferencias de cookies" lo vuelve a abrir aunque ya haya decidido. Vive a
// nivel de módulo porque el aviso es uno solo (está en el layout raíz).
let reabierto = false;

function subscribe(callback: () => void) {
  const reabrir = () => {
    reabierto = true;
    callback();
  };
  window.addEventListener(EVENTO_PREFERENCIAS_COOKIES, reabrir);
  window.addEventListener(EVENTO_DECIDIO, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_PREFERENCIAS_COOKIES, reabrir);
    window.removeEventListener(EVENTO_DECIDIO, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return analiticaDisponible() && (reabierto || leerConsentimiento() === null);
}

function getServerSnapshot() {
  return false;
}

// En el checkout no se muestra: en el celular taparía el botón de pagar.
// Mientras no decida, ahí tampoco se mide nada (PostHog no está iniciado).
const RUTAS_SIN_AVISO = ["/admin", "/pagar", "/carrito"];

/** Aviso de cookies del sitio público (Ley 21.719). PostHog no se inicia
 * hasta que el visitante acepta; ver @/lib/analitica. Aceptar y Rechazar van
 * con el mismo peso visual a propósito: rechazar tiene que ser igual de fácil. */
export default function AvisoCookies() {
  const pathname = usePathname();
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible || RUTAS_SIN_AVISO.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null;

  const decidir = (valor: Consentimiento) => {
    guardarConsentimiento(valor);
    reabierto = false;
    window.dispatchEvent(new Event(EVENTO_DECIDIO));
  };

  return (
    <div className="aviso-cookies" role="region" aria-label="Aviso de cookies">
      <p>
        Usamos cookies de analítica para ver cómo se usa el sitio y mejorarlo. Solo se activan si usted las acepta.
      </p>
      <div className="aviso-cookies-botones">
        <button type="button" className="aviso-cookies-btn" onClick={() => decidir("rechazado")}>
          Rechazar
        </button>
        <button type="button" className="aviso-cookies-btn" onClick={() => decidir("aceptado")}>
          Aceptar
        </button>
      </div>
    </div>
  );
}

/** Link del footer para cambiar la decisión. Solo aparece donde hay analítica
 * (producción, sitio público): en otro lado no hay nada que aceptar. */
export function PreferenciasCookiesLink() {
  const disponible = useSyncExternalStore(subscribe, analiticaDisponible, getServerSnapshot);
  if (!disponible) return null;
  return (
    <button
      type="button"
      className="site-footer-link"
      onClick={() => window.dispatchEvent(new Event(EVENTO_PREFERENCIAS_COOKIES))}
    >
      Preferencias de cookies
    </button>
  );
}
