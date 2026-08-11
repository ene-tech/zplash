"use client";

import { fmtCLP } from "@/lib/helpers";
import { obtenerContenidoServicio } from "@/lib/servicioContenido";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProductoBanner from "@/components/cliente/ProductoBanner";

const WHATSAPP_URL = (nombre: string) =>
  "https://wa.me/56957969446?text=" + encodeURIComponent(`Hola, quiero agendar el servicio "${nombre}" para mi auto`);

export interface DetailingServicioPreview {
  id: string;
  nombre: string;
  precio: number;
}

// Quick view al pinchar un servicio de Detailing (antes navegaba directo a
// /servicios/[id], que sigue existiendo pero ahora es secundaria). Adaptado
// de un template de "product quick preview" de Tailwind Plus: se sacaron
// color/talla/reseñas (no aplican a un servicio de detailing) y "Add to
// bag" quedó como "Agendar por WhatsApp", que es como se reserva acá.
export default function DetailingQuickView({
  servicio,
  onClose,
}: {
  servicio: DetailingServicioPreview | null;
  onClose: () => void;
}) {
  const contenido = servicio ? obtenerContenidoServicio(servicio.id) : null;

  return (
    <Dialog open={!!servicio} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {servicio && contenido && (
          <>
            <ProductoBanner imagen="/fondo-producto.jpg" alt={servicio.nombre} videoUrl={contenido.videoUrl} />
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{servicio.nombre}</DialogTitle>
            </DialogHeader>
            <div className="price-row" style={{ marginBottom: 0 }}>
              <span className="new">{fmtCLP(servicio.precio)}</span>
            </div>
            <p style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.6 }}>{contenido.descripcion}</p>
            <a
              href={WHATSAPP_URL(servicio.nombre)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ textDecoration: "none", display: "flex", justifyContent: "center", width: "100%" }}
            >
              Agendar por WhatsApp
            </a>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
