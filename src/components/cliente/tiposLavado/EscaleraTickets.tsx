import Link from "next/link";
import { Check, Droplets, Layers, Ticket } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";

// Lo que trae cada pase por el túnel, igual en las tres opciones.
const INCLUYE_LAVADO = [
  "Prelavado Hidrolavadora",
  "Jabón SnowFoam Ph Neutro",
  "Cepillos libres de Rayas",
  "Enjuague, Cera y Secado",
  "Aspirado sin límite de tiempo",
];

/** "Ahorras $Y" contra comprar `cantidad` lavados sueltos (el "$X por lavado" va junto al precio). */
function PorLavado({
  precio,
  cantidad,
  unitario,
}: {
  precio: number;
  cantidad: number;
  unitario: number;
}) {
  const ahorro = unitario * cantidad - precio;
  if (cantidad <= 1) {
    return (
      <p style={{ color: "var(--gray)", fontSize: 12.5, margin: "0 0 14px" }}>
        Pago único
      </p>
    );
  }
  return (
    <p
      style={{
        margin: "0 0 14px",
        fontSize: 12.5,
        color: "var(--green)",
        fontWeight: 700,
      }}
    >
      {ahorro > 0 ? `Ahorras ${fmtCLP(ahorro)}` : null}
    </p>
  );
}

type Opcion = {
  item: "lavado_unico" | "promo_2_lavados" | "promo_5_lavados";
  icono: React.ReactNode;
  titulo: string;
  desc: string;
  precio: number;
  cantidad: number;
  extra: string[];
  destacada?: boolean;
};

// Escalera de compra única del lavado túnel: 1 lavado, 2 tickets (Promo 2
// Lavados) y 4 tickets (Promo 5 Lavados), todas por Webpay Plus y sin plan —
// el Plan X5 con cobro automático va aparte (ver TiposLavadoTab). Muestra el
// precio por lavado y el ahorro contra el suelto para que la comparación se
// haga sola. Los precios salen siempre de la base (getPreciosPublicos), los
// mismos que cobra webpay/crear; un pack en $0 está apagado y no se muestra.
// La usan la landing (/) y la landing para compartir (/tickets). Va en tres
// bloques: el lavado suelto solo, "Promociones" con los packs de 2 y 5, y
// `children` bajo "Venta empresa, convenios, familias" (la landing pone ahí el
// pack de 10/+ tickets; /tickets no pasa nada y ese bloque no aparece).
export default function EscaleraTickets({
  precios,
  children,
}: {
  precios: PreciosPublicos;
  children?: React.ReactNode;
}) {
  const unitario = precios.lavadoUnico.precio;
  const opciones: Opcion[] = [
    {
      item: "lavado_unico",
      icono: <Droplets />,
      titulo: "Lavado Full Tunnel",
      desc: "Lavado exterior para cualquier tipo de vehículo (Estándar) y uso de aspiradoras autoservicio ilimitado.",
      precio: unitario,
      cantidad: 1,
      extra: ["Sin reserva de hora"],
    },
    {
      item: "promo_2_lavados",
      icono: <Layers />,
      titulo: `${precios.promo2Lavados.lavados} Tickets de Lavado`,
      desc: `${precios.promo2Lavados.lavados} lavados Full Tunnel para tu auto, a usar dentro de ${precios.promo2Lavados.vigenciaDias} días.`,
      precio: precios.promo2Lavados.precio,
      cantidad: precios.promo2Lavados.lavados,
      extra: [
        `Válidos ${precios.promo2Lavados.vigenciaDias} días desde la compra`,
      ],
    },
    {
      item: "promo_5_lavados",
      icono: <Ticket />,
      titulo: `${precios.promo5Lavados.lavados} Tickets de Lavado`,
      desc: `${precios.promo5Lavados.lavados} lavados Full Tunnel para tu auto, a usar dentro de ${precios.promo5Lavados.vigenciaDias} días. Pagas una vez: sin plan ni renovación.`,
      precio: precios.promo5Lavados.precio,
      cantidad: precios.promo5Lavados.lavados,
      extra: [
        `Válidos ${precios.promo5Lavados.vigenciaDias} días desde la compra`,
      ],
      destacada: true,
    },
  ];

  const visibles = opciones.filter((o) => o.precio > 0);
  const suelto = visibles.filter((o) => o.cantidad === 1);
  const promociones = visibles.filter((o) => o.cantidad > 1);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 22 }}>
      {suelto.length > 0 && (
        <Bloque titulo={null} tarjetas={suelto.length}>
          {suelto.map((o) => tarjeta(o))}
        </Bloque>
      )}
      {promociones.length > 0 && (
        <Bloque titulo="Promociones" tarjetas={promociones.length}>
          {promociones.map((o) => tarjeta(o))}
        </Bloque>
      )}
      {children && (
        <Bloque titulo="Venta empresa, convenios, familias" tarjetas={1}>
          {children}
        </Bloque>
      )}
    </div>
  );

  function tarjeta(o: Opcion) {
    return (
      <div
        key={o.item}
        className={
          o.destacada
            ? "card pricing-card pricing-card--featured"
            : "card pricing-card"
        }
      >
        {o.cantidad > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span className="pricing-card-badge">Uso 1 patente</span>
            <span className="pricing-card-badge">Pago único</span>
          </div>
        )}
        <div className="card-icon-title">
          <span className="icon-chip">{o.icono}</span>
          <h3>{o.titulo}</h3>
        </div>
        <p className="desc">{o.desc}</p>
        <div
          className="price-row"
          style={{ marginTop: 14, marginBottom: 4, flexWrap: "wrap", columnGap: 10, rowGap: 2 }}
        >
          <span className="new">{fmtCLP(o.precio)}</span>
          {o.cantidad > 1 && (
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gold)" }}>
              {fmtCLP(Math.round(o.precio / o.cantidad))}{" "}
              <span style={{ fontSize: 12, fontWeight: 600 }}>por lavado</span>
            </span>
          )}
        </div>
        <PorLavado
          precio={o.precio}
          cantidad={o.cantidad}
          unitario={unitario}
        />
        <ul className="pricing-card-features">
          {[...o.extra, ...INCLUYE_LAVADO].map((t) => (
            <li key={t}>
              <Check /> {t}
            </li>
          ))}
        </ul>
        <Link
          href={`/pagar?item=${o.item}`}
          className="btn"
          style={{ textDecoration: "none" }}
        >
          Comprar
        </Link>
      </div>
    );
  }
}

// Columnas más angostas que el card-grid común (260px) para que las 4 tarjetas
// (suelto, 2, 5 y el pack 10/+) quepan en una fila. Cada bloque crece en
// proporción a sus tarjetas, así todas quedan del mismo ancho, y lleva su
// título encima; el del suelto va vacío (pero ocupa el alto) para que las
// tarjetas partan alineadas. En pantallas angostas los bloques bajan de línea.
const MIN_TARJETA = 190;
const GAP = 18;

function Bloque({
  titulo,
  tarjetas,
  children,
}: {
  titulo: string | null;
  tarjetas: number;
  children: React.ReactNode;
}) {
  const base = tarjetas * MIN_TARJETA + (tarjetas - 1) * GAP;
  return (
    // Columna flex + grilla con flex 1: los bloques de una misma fila se estiran
    // al más alto, así todas las tarjetas quedan del mismo alto.
    <div
      style={{
        flex: `${tarjetas} 1 min(${base}px, 100%)`,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Alto fijo de dos líneas, texto pegado abajo: "Venta empresa,
          convenios, familias" ocupa dos y así las tarjetas parten parejas. */}
      <h3
        style={{
          margin: "8px 0 12px",
          minHeight: "2.5em",
          lineHeight: 1.25,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          textAlign: "center",
        }}
        aria-hidden={titulo ? undefined : true}
      >
        {titulo ?? " "}
      </h3>
      <div
        className="card-grid"
        style={{
          flex: 1,
          gap: GAP,
          gridTemplateColumns: `repeat(auto-fit, minmax(${MIN_TARJETA}px, 1fr))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
