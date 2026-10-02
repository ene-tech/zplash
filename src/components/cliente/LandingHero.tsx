import Image from "next/image";
import { MapPin, Clock, MessageCircle } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "./types";
import { WhatsAppIcon } from "./AnnounceBar";

// Portada de la landing: foto real del túnel (o video si existe
// public/tunel/hero.mp4 — lo decide page.tsx) + propuesta de valor + CTAs.
// Las fotos de "Cómo funciona" son las mismas de la galería de Full Tunnel.
const PASOS = [
  {
    src: "/tunel/barrera-qr.jpg",
    titulo: (
      <>
        Paga por internet <a href="/cliente">AQUÍ</a> o en local con cualquier
        medio de pago
      </>
    ),
    detalle: "La barrera se abre con tu patente.",
  },
  {
    src: "/tunel/espuma-volvo.jpg",
    titulo: "Prelavado y espuma",
    detalle: "Hidrolavadora a presión y SnowFoam pH neutro que suelta la suciedad.",
  },
  {
    src: "/tunel/camioneta-tunel.jpg",
    titulo: "Túnel",
    detalle: "Cepillos libres de rayas, enjuague y secado. Sin bajarte.",
  },
  {
    src: "/tunel/aspirado.jpg",
    titulo: "Aspirado sin límite",
    detalle: "Aspiradoras y aire autoservicio, el tiempo que quieras.",
  },
];

export default function LandingHero({
  precios,
  video,
}: {
  precios: PreciosPublicos;
  video: boolean;
}) {
  return (
    <section className="landing-hero">
      {video ? (
        <video
          className="landing-hero-media"
          src="/tunel/hero.mp4"
          poster="/tunel/prelavado-portada3.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        />
      ) : (
        <Image
          className="landing-hero-media landing-hero-kenburns"
          src="/tunel/prelavado-portada3.jpg"
          alt="Operario prelavando un auto con hidrolavadora antes de entrar al túnel Zplash"
          fill
          priority
          sizes="100vw"
        />
      )}
      <div className="landing-hero-overlay" />
      <div className="landing-hero-body">
        <span className="landing-hero-eyebrow">Lavado por túnel · Temuco</span>
        <h1 className="landing-hero-title">
          Tu auto brillante <span>en minutos</span>, sin bajarte
        </h1>
        <p className="landing-hero-sub">
          Lavado exterior en túnel + aspirado sin límite de tiempo. Llega sin
          reserva, abierto todos los días.
        </p>
        <div className="landing-hero-ctas">
          <a href="#lavados" className="btn landing-hero-cta">
            Plan X5 desde {fmtCLP(precios.planPrimera.precio)}
          </a>
          <a href="#como-funciona" className="btn ghost">
            Cómo funciona
          </a>
        </div>
        <ul className="landing-hero-facts">
          <li>
            <MapPin /> Prieto Norte 71
          </li>
          <li>
            <Clock /> L-V 08:30-20:00 · S-D 10:00-19:00
          </li>
          <li>
            <MessageCircle /> <a href="https://wa.me/56957969446">WhatsApp</a>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function ComoFunciona() {
  return (
    <>
      <h2 className="section-title">Cómo funciona</h2>
      <ol className="como-funciona-grid">
        {PASOS.map((p, i) => (
          <li key={p.src} className="como-funciona-paso">
            <div className="como-funciona-foto">
              <Image
                src={p.src}
                alt={p.detalle}
                fill
                sizes="(max-width: 640px) 100vw, 25vw"
              />
              <span className="como-funciona-num">{i + 1}</span>
            </div>
            <h3>{p.titulo}</h3>
            <p>{p.detalle}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

// Botón flotante abajo a la derecha para abrir el chat de WhatsApp.
export function WhatsAppFlotante() {
  return (
    <a
      href="https://wa.me/56957969446?text=Hola"
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-flotante"
      aria-label="Chatear por WhatsApp"
    >
      <WhatsAppIcon />
    </a>
  );
}
