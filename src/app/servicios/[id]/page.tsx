import Image from "next/image";
import Link from "next/link";
import { Calendar, MessageCircle } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import { obtenerContenidoServicio } from "@/lib/servicioContenido";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import ProductoHero from "@/components/cliente/ProductoHero";
import { TAMANOS_VEHICULO, TAMANO_LABEL, TAMANO_DESCRIPCION } from "@/types";

const WHATSAPP_URL = (nombre: string) =>
  "https://wa.me/56957969446?text=" + encodeURIComponent(`Hola, quiero agendar el servicio "${nombre}" para mi auto`);

export default async function ServicioLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const precios = await getPreciosPublicos();
  const servicio = precios.servicios.find((s) => s.id === id);
  const contenido = obtenerContenidoServicio(id);

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" unoptimized />
          </Link>
          <span className="mode">{servicio?.nombre ?? "Servicio"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/cliente" className="btn secondary btn-mi-cuenta" style={{ marginTop: 0, textDecoration: "none" }}>
            Mi cuenta
          </Link>
        </div>
      </div>

      <div className="content">
        <Link href="/#lavados" className="landing-back">
          ← Volver a Tipos de Lavados
        </Link>

        {!servicio ? (
          <div className="card">
            <p style={{ color: "var(--gray)", fontSize: 14 }}>No encontramos este servicio.</p>
          </div>
        ) : (
          <>
            <ProductoHero
              eyebrow="Detailing"
              titulo={servicio.nombre}
              descripcion={contenido.descripcion}
              imagen="/fondo-producto.jpg"
              videoUrl={contenido.videoUrl}
              features={[
                { icon: <Calendar />, titulo: "Se agenda con horario", detalle: "Cuéntanos la patente de tu auto y coordinamos tu hora." },
                { icon: <MessageCircle />, titulo: "Coordinación por WhatsApp", detalle: "Agenda directo por WhatsApp, sin llamadas." },
              ]}
            >
              {servicio.preciosTamano ? (
                <div className="hours-table">
                  {TAMANOS_VEHICULO.map((t) => (
                    <div key={t} className="hours-row">
                      <span className="dia">
                        {TAMANO_LABEL[t]} · {TAMANO_DESCRIPCION[t]}
                      </span>
                      <span style={{ color: "var(--gold)", fontWeight: 700 }}>{fmtCLP(servicio.preciosTamano![t])}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="price-row" style={{ marginTop: 20, marginBottom: 16 }}>
                  <span className="new">{fmtCLP(servicio.precio)}</span>
                </div>
              )}
              <a
                href={WHATSAPP_URL(servicio.nombre)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ textDecoration: "none", display: "inline-block" }}
              >
                Agendar por WhatsApp
              </a>
            </ProductoHero>
          </>
        )}
      </div>
    </div>
  );
}
