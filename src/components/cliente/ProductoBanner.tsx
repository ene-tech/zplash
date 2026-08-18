import Image from "next/image";

// Banner de una landing de producto: hoy muestra una imagen fija, pero queda
// listo para el video publicitario (videoUrl) que reemplazará la imagen sin
// tocar el resto de la página — mientras no haya video se ve como poster.
// aspectRatio es configurable porque ProductoHero la usa en un layout de 2
// columnas (4/3) en vez del banner ancho (3/1) de las demás páginas.
export default function ProductoBanner({
  imagen,
  alt,
  videoUrl,
  aspectRatio = "3 / 1",
}: {
  imagen: string;
  alt: string;
  videoUrl?: string;
  aspectRatio?: string;
}) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      {videoUrl ? (
        <video
          src={videoUrl}
          poster={imagen}
          controls
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        /* `sizes` es obligatorio junto con `fill`: sin él Next sirve siempre la
            variante más ancha del srcset (la fuente son 1920px para un banner
            que nunca se pinta a más de ~700). Mobile ocupa el ancho completo;
            en el hero de 2 columnas es media columna. */
        <Image src={imagen} alt={alt} fill sizes="(max-width: 900px) 100vw, 700px" style={{ objectFit: "cover" }} />
      )}
    </div>
  );
}
