import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { config, precios, preciosTamano, servicios } from "@/db/schema";
import {
  CANTIDAD_MAXIMA_TICKETS,
  CANTIDAD_MINIMA_TICKETS,
  PLANES,
  precioContratacion,
  precioLavadoUnicoWeb,
  precioNormal,
  precioPlanOneclick,
  precioServicio,
  precioTicketUnitario,
  precioTickets,
  precioZonaAspirado,
  SERVICIOS_DEFAULT,
} from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";

// Fuente única de los precios públicos: la usan tanto Server Components
// (páginas de /cliente, /servicios/*) como /api/pagos/precios (que sigue
// existiendo para los pocos lugares que todavía necesitan pedirlos desde el
// cliente, p.ej. /pagar tras una interacción).
export async function getPreciosPublicos(): Promise<PreciosPublicos> {
  const db = getDb();
  const [filas, filasServicios, filasTamano, [configRow]] = await Promise.all([
    db.select().from(precios),
    db.select().from(servicios).where(eq(servicios.activo, true)),
    db.select().from(preciosTamano),
    db.select({ vigenciaDiasPackEmpresa: config.vigenciaDiasPackEmpresa }).from(config).limit(1),
  ]);
  const preciosMap = Object.fromEntries(filas.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
  const preciosTamanoMap = Object.fromEntries(
    filasTamano.map((p) => [p.servicioId, { s: p.s, m: p.m, l: p.l, xl: p.xl }])
  );
  const catalogo = filasServicios.length ? filasServicios : SERVICIOS_DEFAULT.filter((s) => s.activo);

  return {
    plan: { nombre: PLANES[0], precio: precioNormal(preciosMap, PLANES[0]) },
    planPrimera: { nombre: PLANES[0], precio: precioContratacion(preciosMap, PLANES[0]) },
    planOneclick: { nombre: PLANES[0], precio: precioPlanOneclick(preciosMap) },
    lavadoUnico: { nombre: "Lavado único", precio: precioLavadoUnicoWeb(preciosMap) },
    zonaAspirado: { nombre: "Uso Zona Aspirado Autoservicio", precio: precioZonaAspirado(preciosMap) },
    servicios: catalogo
      .map((s) => ({
        id: s.id,
        nombre: s.nombre,
        categoria: s.categoria ?? undefined,
        precio: precioServicio(preciosMap, s.id),
        preciosTamano: preciosTamanoMap[s.id],
      }))
      // Un servicio sin precio cargado cae a $0 (ver precioServicio en
      // helpers/precios.ts) — eso NO significa "gratis", significa que el
      // admin todavía no le puso precio desde Configuración. Se esconde de
      // todas las superficies públicas (landing, /cliente, /pagar,
      // /servicios/[id]) hasta que tenga un precio real en al menos un
      // tamaño, para que no quede comprable en $0 por descuido.
      .filter((s) => s.precio > 0 || Object.values(s.preciosTamano ?? {}).some((v) => v > 0)),
    tickets: {
      cantidadMinima: CANTIDAD_MINIMA_TICKETS,
      cantidadMaxima: CANTIDAD_MAXIMA_TICKETS,
      precioBase: precioTickets(preciosMap, CANTIDAD_MINIMA_TICKETS),
      precioUnitario: precioTicketUnitario(preciosMap),
      vigenciaDias: configRow?.vigenciaDiasPackEmpresa || 45,
    },
  };
}
