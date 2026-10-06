import type { Metadata } from "next";
import Link from "next/link";
import { Car, LayoutDashboard, Receipt } from "lucide-react";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import { fmtCLP } from "@/lib/helpers";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import ProductoHero from "@/components/cliente/ProductoHero";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import TicketsCard from "@/components/cliente/tiposLavado/TicketsCard";
import { WhatsAppFlotante } from "@/components/cliente/LandingHero";

// Landing del Pack de Tickets 10/+ (TicketsCard): explica cómo se gestiona un
// lote después de comprarlo. Todo lo que dice tiene que calzar con el flujo
// real: los códigos los genera aplicarPagoPackEmpresa atados al correo del
// checkout, se ven en "Mis tickets y cupones" de Mi Cuenta
// (PacksTicketsGestion), se canjean dando el código en caja y solo las
// patentes de la regla pueden usarlos (patenteAutorizadaParaCupon). La regla
// se elige al comprar y el dueño la cambia después por lote o por ticket
// (/api/cliente/mi-cuenta/regla-patentes); el informe es el Excel del lote.
export const metadata: Metadata = {
  title: "Pack de tickets de lavado para flotas y empresas en Temuco | ZPlash",
  description:
    "Compra desde 10 tickets de lavado Full Tunnel, úsalos en cualquier patente y revisa desde tu cuenta cuáles se usaron, en qué auto y cuántos te quedan. Boleta o factura.",
  alternates: { canonical: "/pack-tickets" },
  openGraph: {
    title: "Pack de Tickets ZPlash · desde 10 lavados, para cualquier patente",
    description: "Tickets de lavado prepagados para tu flota o tu familia, gestionados desde tu cuenta.",
    images: ["/tunel/prelavado-portada3.jpg"],
  },
};

export const dynamic = "force-dynamic";

const FOTOS = [
  { src: "/tunel/entrada-tunel.jpg", alt: "Entrada del túnel de lavado Zplash con sus cepillos" },
  { src: "/tunel-bn.webp", alt: "Auto cubierto de espuma entre los cepillos del túnel de lavado" },
  { src: "/tunel/aspirado.jpg", alt: "Zona de aspirado autoservicio con aspiradoras y pistolas de aire" },
];

// Filas de ejemplo de cómo se ve el lote en Mi Cuenta (mismas columnas y
// estados que PacksTicketsGestion). Datos inventados, solo ilustran.
const EJEMPLO = [
  { codigo: "K7P2QX", n: 1, estado: "Usado", cls: "ok", regla: "Cualquier patente", uso: "AB1234", fecha: "03-10-26, 10:42" },
  { codigo: "M3RT8L", n: 2, estado: "Usado", cls: "ok", regla: "Cualquier patente", uso: "CDKL45", fecha: "05-10-26, 17:15" },
  { codigo: "Z9WE4N", n: 3, estado: "Disponible", cls: "warn", regla: "AB1234, CDKL45", uso: "-", fecha: "-" },
  { codigo: "H5YB2C", n: 4, estado: "Disponible", cls: "warn", regla: "FGHJ12", uso: "-", fecha: "-" },
];

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span
        aria-hidden
        style={{
          flex: "0 0 34px",
          height: 34,
          borderRadius: "50%",
          background: "var(--gold)",
          color: "#1a1a1a",
          fontWeight: 900,
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <div>
        <strong style={{ display: "block", fontSize: 16, marginBottom: 2 }}>{titulo}</strong>
        <span style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.45 }}>{children}</span>
      </div>
    </li>
  );
}

export default async function PackTicketsPage() {
  const precios = await getPreciosPublicos();
  const t = precios.tickets;

  const preguntas = [
    {
      q: "¿Dónde veo mis tickets?",
      a: [
        "En Mi Cuenta, entrando con el mismo correo que usaste al comprar, en la sección \"Mis packs de tickets\".",
        "Ahí aparece cada lote, con cada código, si está disponible o usado, y en qué patente se usó.",
      ],
    },
    {
      q: "¿Cómo se usa un ticket en el local?",
      a: "Quien lleve el auto da el código del ticket en caja y pasa al túnel. Si dejaste el lote abierto, sirve para cualquier patente.",
    },
    {
      q: "¿Puedo limitar los tickets a los autos de mi empresa?",
      a: "Sí. Al comprar eliges \"Ingresar patentes de mi flota\", y después puedes cambiar la regla desde Mi Cuenta, para el lote completo o para un ticket puntual. Un ticket con regla solo se puede usar en esas patentes.",
    },
    {
      q: "¿Cómo veo el informe de uso?",
      a: "En Mi Cuenta, cada lote tiene el botón \"Descargar informe\": un Excel con cada ticket, su estado, las patentes autorizadas, la patente y la hora de uso.",
    },
    {
      q: "¿Cuánto duran?",
      a: `${t.vigenciaDias} días desde la compra.`,
    },
    {
      q: "¿Puedo pedir factura?",
      a: "Sí. Al comprar eliges Factura e ingresas RUT, razón social, dirección y giro. Con ese RUT también puedes consultar el uso de los tickets desde esta página, sin entrar a tu cuenta.",
    },
    {
      q: "¿Puedo comprar más de 10?",
      a: `Sí, la cantidad que necesites desde ${t.cantidadMinima}, al mismo precio por ticket${
        t.precioUnitario > 0 ? ` (${fmtCLP(t.precioUnitario)} c/u)` : ""
      }.`,
    },
  ];

  return (
    <div id="app">
      <ClienteHeader titulo="Pack de Tickets" />

      <div className="content">
        <ProductoHero
          eyebrow="Flotas, empresas y familias · Temuco"
          titulo={`Pack de Tickets ${t.cantidadMinima}/+`}
          descripcion="Compra tus lavados Full Tunnel por adelantado y repártelos entre los autos que quieras. Cada ticket tiene su propio código y desde tu cuenta sabes en todo momento cuáles se usaron, en qué patente y cuántos te quedan."
          imagen={FOTOS}
          features={[
            { icon: <Car />, titulo: "Abierto a cualquier patente", detalle: "No quedan atados a un auto, o los limitas a tu flota." },
            { icon: <LayoutDashboard />, titulo: "Gestión desde la plataforma", detalle: "Reglas de patente e informe de uso desde Mi Cuenta." },
            { icon: <Receipt />, titulo: "Boleta o factura", detalle: "IVA incluido, pago con Webpay." },
          ]}
        >
          {t.precioBase > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 8 }}>
                Desde {t.cantidadMinima} tickets por {fmtCLP(t.precioBase)}: {fmtCLP(t.precioUnitario)} cada uno.
              </p>
              <a href="#comprar" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
                Comprar tickets
              </a>
            </div>
          )}
        </ProductoHero>

        <h2 className="section-title">Cómo funciona</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "grid", gap: 18 }}>
          <Paso n={1} titulo="Compras el pack">
            Eliges cuántos tickets quieres (desde {t.cantidadMinima}), pones tu correo y, si quieres, un nombre para el lote
            (ej. &quot;Lavados flota octubre&quot;). Pagas con Webpay, con boleta o factura.
          </Paso>
          <Paso n={2} titulo="Decides para qué autos son">
            Lo dejas <strong>abierto a cualquier patente</strong>, o ingresas las patentes de tu flota para que solo esos
            autos puedan usarlos.
          </Paso>
          <Paso n={3} titulo="Tus tickets quedan en tu cuenta">
            Entra a <strong>Mi Cuenta</strong> con el mismo correo de la compra: ahí está el lote completo, con un código
            por ticket.
          </Paso>
          <Paso n={4} titulo="Se usan dando el código en caja">
            Comparte los códigos con quien lleve cada auto. En el local dan el código en caja y pasan al túnel.
          </Paso>
          <Paso n={5} titulo="Cambias las reglas cuando quieras">
            Desde Mi Cuenta cambias qué patentes pueden usar <strong>todo el lote o un ticket puntual</strong>: por
            ejemplo, deja un ticket solo para el auto de un chofer y el resto abierto.
          </Paso>
          <Paso n={6} titulo="Descargas el informe de uso">
            Cada lote tiene su <strong>informe en Excel</strong>: qué tickets se usaron, en qué patente, a qué hora y
            cuántos te quedan.
          </Paso>
        </ol>

        <h2 className="section-title">Así lo ves en Mi Cuenta</h2>
        <div className="card" style={{ marginBottom: 28 }}>
          <p style={{ color: "var(--gray)", fontSize: 13, marginTop: 0 }}>Ejemplo de un lote en &quot;Mis packs de tickets&quot;. Cada lote tiene los botones <strong>Reglas del lote</strong> y{" "}
            <strong>Descargar informe</strong>, y cada ticket disponible su botón <strong>Cambiar</strong>.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Estado</th>
                  <th>Patentes autorizadas</th>
                  <th>Patente de uso</th>
                  <th>Fecha de uso</th>
                </tr>
              </thead>
              <tbody>
                {EJEMPLO.map((f) => (
                  <tr key={f.codigo}>
                    <td>
                      <span className="plate-tag">{f.codigo}</span>
                      <div style={{ color: "var(--gray)", fontSize: 12 }}>
                        N° {f.n}/{t.cantidadMinima}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${f.cls}`}>{f.estado}</span>
                    </td>
                    <td>{f.regla}</td>
                    <td>{f.uso}</td>
                    <td>{f.fecha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, marginBottom: 0 }}>
            ¿Ya compraste? <Link href="/cliente">Entra a Mi Cuenta</Link> para ver tus tickets.
          </p>
        </div>

        <h2 id="comprar" className="section-title">
          Compra tu pack
        </h2>
        <div style={{ maxWidth: 460, margin: "0 auto 28px" }}>
          <TicketsCard precios={precios} linkLanding={false} />
        </div>

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={preguntas} />

        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          <Link href="/">Ver todos los servicios de ZPlash</Link>
          {" · "}
          <Link href="/politicas">Políticas de Funcionamiento y Garantía</Link>
        </p>
      </div>
      <WhatsAppFlotante />
    </div>
  );
}
