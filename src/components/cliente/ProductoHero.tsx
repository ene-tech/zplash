import type { ReactNode } from "react";
import ProductoBanner, { type BannerFoto } from "@/components/cliente/ProductoBanner";

export interface ProductoHeroFeature {
  icon: ReactNode;
  titulo: string;
  detalle: string;
}

// Hero de 2 columnas (imagen + historia/checklist) adaptado de un template
// de Tailwind Plus para las landings de un solo producto — ver el comentario
// de .feature-split en globals.css sobre por qué TiposLavadoTab/DetailingTab
// no lo usan. `children` es el slot opcional de precio + botón de compra:
// queda afuera cuando la página tiene más de un precio (Plan Mensual, con
// pago período a período vs. renovación automática), donde esas opciones
// siguen viviendo en sus propias cards debajo del hero.
export default function ProductoHero({
  eyebrow,
  titulo,
  descripcion,
  features,
  imagen,
  videoUrl,
  children,
}: {
  eyebrow: string;
  titulo: string;
  descripcion: string;
  features?: ProductoHeroFeature[];
  imagen: string | BannerFoto[];
  videoUrl?: string;
  children?: ReactNode;
}) {
  return (
    <div className="feature-split">
      <div>
        <p className="feature-eyebrow">{eyebrow}</p>
        <h1 className="feature-title">{titulo}</h1>
        <p className="feature-desc">{descripcion}</p>

        {features && features.length > 0 && (
          <dl className="feature-list">
            {features.map((f) => (
              <div className="feature-list-item" key={f.titulo}>
                <span className="icon-chip">{f.icon}</span>
                <dt>{f.titulo}. </dt>
                <dd>{f.detalle}</dd>
              </div>
            ))}
          </dl>
        )}

        {children}
      </div>

      <ProductoBanner imagen={imagen} alt={titulo} videoUrl={videoUrl} aspectRatio="4 / 3" />
    </div>
  );
}
