import "server-only";
import { unstable_cache } from "next/cache";
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

/**
 * Etiqueta de caché de todo el contenido público con precio. Cualquier
 * escritura que cambie lo que ve un visitante anónimo (precios, precios por
 * tamaño, catálogo de servicios, config) tiene que llamar
 * `revalidateTag(TAG_CONTENIDO_PUBLICO)` — ver los Server Actions de
 * precios/servicios/config. Sin esa llamada el sitio público seguiría
 * mostrando el precio viejo hasta que expire el TTL de abajo.
 */
export const TAG_CONTENIDO_PUBLICO = "contenido-publico";

/**
 * Perfil de invalidación para `revalidateTag`. `expire: 0` = la entrada muere
 * en el acto y la siguiente visita paga una lectura a la base, en vez del
 * `"max"` que recomienda Next (stale-while-revalidate: el primer visitante
 * después del cambio todavía vería el precio viejo). Acá eso no sirve: el
 * precio en pantalla es el que el cliente va a pagar en Webpay, así que un
 * solo render con el valor anterior es un problema de plata, no de frescura.
 */
export const INVALIDAR_YA = { expire: 0 } as const;

async function leerPreciosPublicos(): Promise<PreciosPublicos> {
  const db = getDb();
  const [filas, filasServicios, filasTamano, [configRow]] = await Promise.all([
    db.select().from(precios),
    db.select().from(servicios).where(eq(servicios.activo, true)),
    db.select().from(preciosTamano),
    db
      .select({
        vigenciaDiasPackEmpresa: config.vigenciaDiasPackEmpresa,
        descuentoPrimeraVezValor: config.descuentoPrimeraVezValor,
        descuentoPrimeraVezDiasValidez: config.descuentoPrimeraVezDiasValidez,
      })
      .from(config)
      .limit(1),
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
    descuentoBienvenida: {
      valor: configRow?.descuentoPrimeraVezValor || 1000,
      diasValidez: configRow?.descuentoPrimeraVezDiasValidez || 7,
    },
  };
}

/**
 * Fuente única de los precios públicos: la usan tanto Server Components
 * (landing, /servicios/*, /pagar, /cliente/detailing) como /api/pagos/precios
 * (que sigue existiendo para los pocos lugares que todavía los piden desde el
 * navegador).
 *
 * Cacheado porque estas 4 queries corrían de nuevo en CADA visita anónima a
 * la landing y a las 4 páginas de producto — el round-trip a Supabase era el
 * grueso del TTFB de la única puerta de entrada del sitio, para datos que
 * cambian cuando el admin toca precios (semanas) y no cuando entra un
 * visitante. La coherencia con lo que cobra /api/pagos/webpay/crear se
 * mantiene por invalidación explícita (TAG_CONTENIDO_PUBLICO), no por TTL: el
 * `revalidate` de 1 hora es solo la red de seguridad por si una escritura
 * futura se olvida de invalidar.
 */
export const getPreciosPublicos = unstable_cache(leerPreciosPublicos, ["precios-publicos"], {
  tags: [TAG_CONTENIDO_PUBLICO],
  revalidate: 3600,
});
