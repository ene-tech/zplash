"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// "¿Cómo está la fila ahora?": foto de la entrada del local para que el
// cliente con plan salga de la casa en un momento desocupado.
//
// Es una foto que se refresca, no un video en vivo, a propósito: la pregunta
// que hay que contestar es "¿cuántos autos hay?", y una imagen cada 10s la
// contesta sin RTSP/HLS ni transcodificación. La sube el PC del local a
// /api/camara/fila (ver scripts/subir-foto-fila.ps1).
//
// Solo se muestra con la app instalada (display-mode: standalone). Ese filtro
// es cosmético -- se falsea desde el navegador --; el permiso real (plan
// vigente) lo decide /api/cliente/fila, que es lo que devuelve 403.
const REFRESCO_MS = 10_000;

type Estado = "cargando" | "oculto" | "sin-imagen" | { url: string };

// Instalada o no se sabe en el primer render y no cambia en la sesión, así
// que va por useSyncExternalStore (nunca notifica) en vez de un efecto que
// setea estado: sin snapshot de servidor el render inicial no coincidiría.
const nuncaCambia = () => () => {};
const enPwa = () => window.matchMedia("(display-mode: standalone)").matches;

export function FilaEnVivo() {
  const instalada = useSyncExternalStore(nuncaCambia, enPwa, () => false);
  const [estado, setEstado] = useState<Estado>("cargando");

  useEffect(() => {
    if (!instalada) return;
    let cancelado = false;

    const cargar = async () => {
      // Sin esto la PWA seguiría pidiendo la foto en segundo plano toda la
      // tarde: no la ve nadie y firma una URL nueva cada 10s.
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/cliente/fila");
        if (cancelado) return;
        if (!res.ok) {
          setEstado("oculto");
          return;
        }
        const data = (await res.json()) as { url: string | null };
        if (!cancelado) setEstado(data.url ? { url: data.url } : "sin-imagen");
      } catch {
        if (!cancelado) setEstado("oculto");
      }
    };

    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    // visibilitychange además del interval: al volver a la app la foto en
    // pantalla puede tener minutos, y esperar hasta 10s a que toque el
    // interval es justo el rato en que el cliente está mirando.
    document.addEventListener("visibilitychange", cargar);
    return () => {
      cancelado = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", cargar);
    };
  }, [instalada]);

  if (!instalada || estado === "cargando" || estado === "oculto") return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 10px" }}>¿Cómo está la fila ahora?</h3>
      {typeof estado === "object" ? (
        // <img> y no next/image: la URL viene firmada y distinta cada 10s, así
        // que el optimizador de Next erraría el caché siempre y cobraría una
        // transformación por foto, para una imagen que ya sale del CDN de
        // Supabase en el tamaño que se muestra.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={estado.url}
          alt="Entrada del lavado en este momento"
          style={{ width: "100%", borderRadius: 8, display: "block", aspectRatio: "16 / 9", objectFit: "cover", background: "#00000033" }}
        />
      ) : (
        <p style={{ color: "var(--gray)", fontSize: 14, margin: 0 }}>Sin imagen en este momento. Intenta en un rato.</p>
      )}
      <p style={{ color: "var(--gray)", fontSize: 12.5, margin: "10px 0 0" }}>
        Se actualiza cada 10 segundos mientras tengas esta pantalla abierta.
      </p>
    </div>
  );
}
