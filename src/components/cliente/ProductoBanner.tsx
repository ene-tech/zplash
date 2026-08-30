"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface BannerFoto {
  src: string;
  alt: string;
}

// Banner de una landing de producto: una imagen fija, un carrusel de fotos
// (scroll-snap nativo, sin librería) o el video publicitario (videoUrl) que
// reemplazará a cualquiera de los dos sin tocar el resto de la página.
// aspectRatio es configurable porque ProductoHero la usa en un layout de 2
// columnas (4/3) en vez del banner ancho (3/1) de las demás páginas.
export default function ProductoBanner({
  imagen,
  alt,
  videoUrl,
  aspectRatio = "3 / 1",
}: {
  imagen: string | BannerFoto[];
  alt: string;
  videoUrl?: string;
  aspectRatio?: string;
}) {
  const fotos: BannerFoto[] = Array.isArray(imagen) ? imagen : [{ src: imagen, alt }];
  const track = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  const irA = (n: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * ((n + fotos.length) % fotos.length), behavior: "smooth" });
  };

  return (
    <div className="producto-banner" style={{ aspectRatio }}>
      {videoUrl ? (
        <video src={videoUrl} poster={fotos[0].src} controls playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <>
          <div
            ref={track}
            className="banner-track"
            onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {fotos.map((f) => (
              /* `sizes` es obligatorio junto con `fill`: sin él Next sirve siempre la
                 variante más ancha del srcset (la fuente son 1920px para un banner
                 que nunca se pinta a más de ~700). Mobile ocupa el ancho completo;
                 en el hero de 2 columnas es media columna. */
              <div className="banner-slide" key={f.src}>
                <Image src={f.src} alt={f.alt} fill sizes="(max-width: 900px) 100vw, 700px" style={{ objectFit: "cover" }} />
              </div>
            ))}
          </div>

          {fotos.length > 1 && (
            <>
              <button type="button" className="banner-flecha izq" aria-label="Foto anterior" onClick={() => irA(actual - 1)}>
                <ChevronLeft size={20} />
              </button>
              <button type="button" className="banner-flecha der" aria-label="Foto siguiente" onClick={() => irA(actual + 1)}>
                <ChevronRight size={20} />
              </button>
              <div className="banner-dots">
                {fotos.map((f, i) => (
                  <button
                    key={f.src}
                    type="button"
                    className={i === actual ? "activo" : undefined}
                    aria-label={`Ir a la foto ${i + 1}`}
                    aria-current={i === actual}
                    onClick={() => irA(i)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
