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

/** "$X por lavado · ahorras $Y" contra comprar `cantidad` lavados sueltos. */
function PorLavado({ precio, cantidad, unitario }: { precio: number; cantidad: number; unitario: number }) {
  const ahorro = unitario * cantidad - precio;
  return (
    <p style={{ color: "var(--gray)", fontSize: 12.5, margin: "0 0 14px" }}>
      {cantidad > 1 ? `${fmtCLP(precio / cantidad)} por lavado` : "Pago único"}
      {ahorro > 0 && (
        <>
          {" · "}
          <span style={{ color: "var(--green)", fontWeight: 700 }}>ahorras {fmtCLP(ahorro)}</span>
        </>
      )}
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
// Lavados) y 5 tickets (Promo 5 Lavados), todas por Webpay Plus y sin plan —
// el Plan X5 con cobro automático va aparte (ver TiposLavadoTab). Muestra el
// precio por lavado y el ahorro contra el suelto para que la comparación se
// haga sola. Los precios salen siempre de la base (getPreciosPublicos), los
// mismos que cobra webpay/crear; un pack en $0 está apagado y no se muestra.
// La usan la landing (/) y la landing para compartir (/tickets).
export default function EscaleraTickets({ precios }: { precios: PreciosPublicos }) {
  const unitario = precios.lavadoUnico.precio;
  const opciones: Opcion[] = [
    {
      item: "lavado_unico",
      icono: <Droplets />,
      titulo: "1 Lavado Full Tunnel",
      desc: "Un pase por el túnel. Llega cuando quieras, sin reserva de hora.",
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
      extra: [`Válidos ${precios.promo2Lavados.vigenciaDias} días desde la compra`],
    },
    {
      item: "promo_5_lavados",
      icono: <Ticket />,
      titulo: `${precios.promo5Lavados.lavados} Tickets de Lavado`,
      desc: `${precios.promo5Lavados.lavados} lavados Full Tunnel para tu auto, a usar dentro de ${precios.promo5Lavados.vigenciaDias} días. Pagas una vez: sin plan ni renovación.`,
      precio: precios.promo5Lavados.precio,
      cantidad: precios.promo5Lavados.lavados,
      extra: [`Válidos ${precios.promo5Lavados.vigenciaDias} días desde la compra`],
      destacada: true,
    },
  ];

  return (
    <div className="card-grid" style={{ marginBottom: 22 }}>
      {opciones
        .filter((o) => o.precio > 0)
        .map((o) => (
          <div key={o.item} className={o.destacada ? "card pricing-card pricing-card--featured" : "card pricing-card"}>
            {o.destacada && <span className="pricing-card-badge">Más conveniente</span>}
            <div className="card-icon-title">
              <span className="icon-chip">{o.icono}</span>
              <h3>{o.titulo}</h3>
            </div>
            <p className="desc">{o.desc}</p>
            <div className="price-row" style={{ marginTop: 14, marginBottom: 4 }}>
              <span className="new">{fmtCLP(o.precio)}</span>
            </div>
            <PorLavado precio={o.precio} cantidad={o.cantidad} unitario={unitario} />
            <ul className="pricing-card-features">
              {[...o.extra, ...INCLUYE_LAVADO].map((t) => (
                <li key={t}>
                  <Check /> {t}
                </li>
              ))}
            </ul>
            <Link href={`/pagar?item=${o.item}`} className="btn" style={{ textDecoration: "none" }}>
              Comprar
            </Link>
          </div>
        ))}
    </div>
  );
}
