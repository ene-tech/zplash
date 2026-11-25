"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { PASES_INCLUIDOS_X3, fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";
import { INCLUYE_LAVADO } from "./EscaleraTickets";
import { FormularioCompraTickets } from "./FormularioCompraTickets";
import { ConsultaTickets } from "./ConsultaTickets";

// Precios de la sección Lavados de la landing, con el diseño de "pricing"
// (21st.dev, @uilayout.contact) en dorado Zplash: tarjetas con la destacada en
// borde y fondo dorado, botón con degradé y lista con check en círculo.
// Tres grupos en orden de prioridad: lavado único y promociones, planes
// mensuales y venta empresa. Precios siempre desde la base (getPreciosPublicos);
// un pack o plan en $0 está apagado y no se muestra.
// /tickets sigue usando EscaleraTickets y /pack-tickets la TicketsCard.

type Tarjeta = {
  clave: string;
  nombre: string;
  descripcion: string;
  precio: number;
  sufijo: string;
  // Línea bajo el precio ("$7.995 por lavado") y el ahorro, en verde
  detalle?: string;
  ahorro?: number;
  etiqueta?: string;
  destacada?: boolean;
  boton: { texto: string; href: string };
  incluyeTitulo: string;
  incluye: string[];
};

// Entrada suave al aparecer en pantalla: sin desenfoque, que pesa en celulares lentos
const aparecer = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.45, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
});

function Check({ texto }: { texto: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-6 shrink-0 place-content-center rounded-full border border-[#E5AE00] bg-white">
        <CheckCheck className="size-4 text-[#B58500]" aria-hidden />
      </span>
      <span className="text-sm text-neutral-600">{texto}</span>
    </li>
  );
}

const claseBoton = (destacada?: boolean) =>
  cn(
    "block w-full rounded-xl p-3.5 text-center text-lg font-semibold no-underline transition-transform active:scale-[0.98]",
    destacada
      ? "border border-[#E5AE00] bg-gradient-to-t from-[#F5B400] to-[#FFC72C] text-neutral-900 shadow-lg shadow-[#FFC72C]/50"
      : "border border-neutral-700 bg-gradient-to-t from-neutral-900 to-neutral-600 text-white shadow-lg shadow-neutral-900/30",
  );

// En celular la tarjeta es compacta (nombre, precio, por lavado y botón al
// costado; sin descripción ni lista) para que los 3 tickets quepan en una
// pantalla; la lista va una sola vez debajo del grupo (IncluyeCelular).
function TarjetaPrecio({ t, i }: { t: Tarjeta; i: number }) {
  return (
    <motion.div
      {...aparecer(i)}
      className={cn(
        "relative flex flex-col rounded-2xl border border-neutral-200 p-4 md:p-6",
        t.destacada ? "bg-[#FFF8E1] ring-2 ring-[#FFC72C]" : "bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-lg font-semibold text-neutral-900 md:text-2xl">{t.nombre}</h3>
        {t.etiqueta && (
          <span className="shrink-0 rounded-full bg-[#FFC72C] px-2.5 py-0.5 text-[11px] font-semibold text-neutral-900 md:px-3 md:py-1 md:text-xs">
            {t.etiqueta}
          </span>
        )}
      </div>
      <p className="mt-2 mb-4 hidden text-sm text-neutral-600 md:block">{t.descripcion}</p>

      <div className="mt-1 flex items-end justify-between gap-3 md:mt-0 md:block">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[26px] leading-tight font-semibold text-neutral-900 md:text-4xl">{fmtCLP(t.precio)}</span>
            <span className="text-sm text-neutral-600 md:text-base">{t.sufijo}</span>
          </div>
          <p className="mt-0.5 text-[13px] md:mt-1 md:mb-5 md:min-h-[1.25rem] md:text-sm">
            {t.detalle && <span className="font-semibold text-[#8A6500]">{t.detalle}</span>}
            {t.detalle && t.ahorro && t.ahorro > 0 ? " · " : null}
            {t.ahorro && t.ahorro > 0 ? <span className="font-semibold text-[var(--green)]">Ahorras {fmtCLP(t.ahorro)}</span> : null}
          </p>
        </div>
        <Link
          href={t.boton.href}
          className={cn(claseBoton(t.destacada), "w-auto shrink-0 px-4 py-2.5 text-base md:w-full md:p-3.5 md:text-lg")}
        >
          {t.boton.texto}
        </Link>
      </div>

      <div className="mt-6 hidden border-t border-neutral-200 pt-4 md:block">
        <p className="mb-3 text-sm font-semibold tracking-wide text-neutral-900 uppercase">{t.incluyeTitulo}</p>
        <ul className="m-0 list-none space-y-2 p-0">
          {t.incluye.map((x) => (
            <Check key={x} texto={x} />
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function Grilla({
  tarjetas,
  columnas,
  incluye,
}: {
  tarjetas: Tarjeta[];
  columnas: 2 | 3;
  incluye?: { titulo: string; items: string[] };
}) {
  return (
    <div className="mb-6">
      <div className={cn("grid gap-3 md:gap-4", columnas === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {tarjetas.map((t, i) => (
          <TarjetaPrecio key={t.clave} t={t} i={i} />
        ))}
      </div>
      {incluye && <IncluyeCelular titulo={incluye.titulo} items={incluye.items} />}
    </div>
  );
}

// Solo celular: lo que incluye cada lavado, una vez por grupo y en poco alto
function IncluyeCelular({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <p className="mt-3 text-[13px] leading-snug text-neutral-600 md:hidden">
      <span className="font-semibold text-neutral-900">{titulo}: </span>
      {items.join(" · ")}.
    </p>
  );
}

export function TarjetasUnicoYPromos({ precios }: { precios: PreciosPublicos }) {
  const unitario = precios.lavadoUnico.precio;
  const p2 = precios.promo2Lavados;
  const p4 = precios.promo5Lavados;
  const tarjetas: Tarjeta[] = [
    {
      clave: "lavado_unico",
      nombre: "Lavado Full Tunnel",
      descripcion: "Lavado exterior para cualquier tipo de vehículo (Estándar) y aspirado autoservicio sin límite.",
      precio: unitario,
      sufijo: "pago único",
      boton: { texto: "Comprar", href: "/pagar?item=lavado_unico" },
      incluyeTitulo: "Incluye",
      incluye: ["Sin reserva de hora", ...INCLUYE_LAVADO],
    },
    {
      clave: "promo_2_lavados",
      nombre: `${p2.lavados} Tickets de Lavado`,
      descripcion: `${p2.lavados} lavados Full Tunnel para tu auto, a usar dentro de ${p2.vigenciaDias} días.`,
      precio: p2.precio,
      sufijo: "pago único",
      detalle: `${fmtCLP(Math.round(p2.precio / p2.lavados))} por lavado`,
      ahorro: unitario * p2.lavados - p2.precio,
      boton: { texto: "Comprar", href: "/pagar?item=promo_2_lavados" },
      incluyeTitulo: "Cada lavado incluye",
      incluye: [`Válidos ${p2.vigenciaDias} días desde la compra`, "Uso en 1 patente", ...INCLUYE_LAVADO],
    },
    {
      clave: "promo_5_lavados",
      nombre: `${p4.lavados} Tickets de Lavado`,
      descripcion: `${p4.lavados} lavados Full Tunnel para tu auto, a usar dentro de ${p4.vigenciaDias} días. Pagas una vez: sin plan ni renovación.`,
      precio: p4.precio,
      sufijo: "pago único",
      detalle: `${fmtCLP(Math.round(p4.precio / p4.lavados))} por lavado`,
      ahorro: unitario * p4.lavados - p4.precio,
      etiqueta: "Más conveniente",
      destacada: true,
      boton: { texto: "Comprar", href: "/pagar?item=promo_5_lavados" },
      incluyeTitulo: "Cada lavado incluye",
      incluye: [`Válidos ${p4.vigenciaDias} días desde la compra`, "Uso en 1 patente", ...INCLUYE_LAVADO],
    },
  ].filter((t) => t.precio > 0);

  return (
    <MotionConfig reducedMotion="user">
      <Grilla tarjetas={tarjetas} columnas={3} incluye={{ titulo: "Cada lavado incluye", items: INCLUYE_LAVADO }} />
    </MotionConfig>
  );
}

export function TarjetasPlanes({ precios }: { precios: PreciosPublicos }) {
  const comunes = ["Renovación automática con tu tarjeta", "Te avisamos antes de que venza", "Aspirado autoservicio sin límite"];
  const tarjetas: Tarjeta[] = [
    {
      clave: "plan_x3",
      nombre: "Plan X3",
      descripcion: `${PASES_INCLUIDOS_X3} lavados por el túnel cada mes, sin preocuparte de volver a comprar: se cobra solo a tu tarjeta con Oneclick.`,
      precio: precios.planX3Oneclick.precio,
      sufijo: "/ mes",
      detalle: `${PASES_INCLUIDOS_X3} lavados al mes · ${fmtCLP(Math.round(precios.planX3Oneclick.precio / PASES_INCLUIDOS_X3))} c/u`,
      boton: { texto: "Activar plan", href: "/pagar?item=plan_x3" },
      incluyeTitulo: "Incluye",
      incluye: [`${PASES_INCLUIDOS_X3} lavados Full Tunnel al mes`, ...comunes],
    },
    {
      clave: "plan_x5",
      nombre: "Plan X5",
      descripcion: "5 lavados por el túnel cada mes, sin preocuparte de volver a comprar: se cobra solo a tu tarjeta con Oneclick.",
      precio: precios.planOneclick.precio,
      sufijo: "/ mes",
      detalle: `5 lavados al mes · ${fmtCLP(Math.round(precios.planOneclick.precio / 5))} c/u`,
      etiqueta: "¿Lavas todos los meses?",
      destacada: true,
      boton: { texto: "Activar plan", href: "/servicios/plan-mensual" },
      incluyeTitulo: "Incluye",
      incluye: ["5 lavados Full Tunnel al mes", ...comunes],
    },
  ].filter((t) => t.precio > 0);

  return (
    <MotionConfig reducedMotion="user">
      <Grilla tarjetas={tarjetas} columnas={2} incluye={{ titulo: "Los planes incluyen", items: comunes }} />
    </MotionConfig>
  );
}

// Otras opciones: la Zona Aspirado Autoservicio sola, mismo diseño.
export function TarjetaAspirado({ precios }: { precios: PreciosPublicos | null }) {
  if (!precios || precios.zonaAspirado.precio <= 0) return null;
  const t: Tarjeta = {
    clave: "zona_aspirado",
    nombre: "Zona Aspirado Autoservicio",
    descripcion:
      "Uso único de estación de aspirado autoservicio para el interior de tu auto, cuando no necesitas lavar el exterior.",
    precio: precios.zonaAspirado.precio,
    sufijo: "por uso",
    boton: { texto: "Ver detalles", href: "/servicios/zona-aspirado" },
    incluyeTitulo: "Incluye",
    incluye: ["Sin límite de tiempo por uso"],
  };
  return (
    <MotionConfig reducedMotion="user">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <TarjetaPrecio t={t} i={0} />
      </div>
    </MotionConfig>
  );
}

// Venta empresa: tarjeta ancha con el mismo diseño. Comprar abre el mismo
// formulario de siempre (FormularioCompraTickets) y la consulta de tickets.
export function TarjetaEmpresa({ precios }: { precios: PreciosPublicos | null }) {
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [consultaAbierta, setConsultaAbierta] = useState(false);
  const tickets = precios?.tickets;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div {...aparecer(0)} className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="m-0 text-2xl font-semibold text-neutral-900">
                <Link href="/pack-tickets" className="text-inherit no-underline">
                  Pack de Tickets 10/+
                </Link>
              </h3>
              <span className="shrink-0 rounded-full bg-[#FFC72C] px-3 py-1 text-xs font-semibold text-neutral-900">
                Para cualquier patente
              </span>
            </div>
            <p className="mt-2 mb-4 text-sm text-neutral-600">
              Tickets de lavado prepagados para tu flota, tu familia o tu día a día. Cómpralos por adelantado y úsalos
              cuando quieras.
            </p>
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-4xl font-semibold text-neutral-900">{tickets ? fmtCLP(tickets.precioBase) : "..."}</span>
              <span className="text-neutral-600">{tickets ? `${tickets.cantidadMinima} tickets` : ""}</span>
            </div>
            <p className="mt-1 mb-5 text-sm font-semibold text-[#8A6500]">
              {tickets ? `${fmtCLP(tickets.precioUnitario)} por lavado` : ""}
            </p>
            <button type="button" className={claseBoton(false)} onClick={() => setCompraAbierta((v) => !v)}>
              {compraAbierta ? "Cerrar" : "Comprar"}
            </button>
            {compraAbierta && tickets && (
              <FormularioCompraTickets
                cantidadMinima={tickets.cantidadMinima}
                cantidadMaxima={tickets.cantidadMaxima}
                precioUnitario={tickets.precioUnitario}
              />
            )}
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm font-semibold text-neutral-900 shadow-sm"
              onClick={() => setConsultaAbierta((v) => !v)}
            >
              {consultaAbierta ? "Ocultar" : "¿Ya compraste? Consulta tus tickets"}
            </button>
            {consultaAbierta && (
              <div className="mt-3">
                <ConsultaTickets />
              </div>
            )}
          </div>

          <div className="border-neutral-200 md:border-l md:pl-6">
            <p className="mb-3 text-sm font-semibold tracking-wide text-neutral-900 uppercase">Incluye</p>
            <ul className="m-0 list-none space-y-2 p-0">
              <Check texto="Abierto a cualquier patente, o limitado a las de tu flota" />
              <Check texto="Gestión de cada ticket desde Mi Cuenta, con informe de uso" />
              <Check texto={`Válido ${tickets?.vigenciaDias ?? 45} días desde la compra`} />
              <Check texto={`Agrega los que quieras desde ${tickets ? tickets.cantidadMinima : 10}`} />
              <Check texto="Boleta o factura, IVA incluido" />
            </ul>
          </div>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
