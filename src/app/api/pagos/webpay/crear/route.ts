import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pagosWebpay, pagosWebpayItems, precios, servicios } from "@/db/schema";
import {
  PLANES,
  formatRut,
  isValidEmail,
  isValidPatente,
  isValidRut,
  normPlate,
  precioContratacion,
  precioLavadoUnicoWeb,
  precioRenovacionCliente,
  precioConCupon,
  precioServicio,
  precioZonaAspirado,
} from "@/lib/helpers";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { getConfig } from "@/lib/dataAccess/config";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { buscarCuponDescuentoPlan } from "@/lib/pagos";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import { webpayTransaction } from "@/lib/transbank";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 10;
const VENTANA_MS = 5 * 60 * 1000;
const MAX_ITEMS = 20;

type TipoPago = "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" | "aspirado" | "renovacion_temprana" | "reactivacion" | "upgrade_plan";
const TIPOS_VALIDOS = new Set<TipoPago>([
  "plan_nuevo",
  "renovacion",
  "servicio",
  "lavado_unico",
  "aspirado",
  "renovacion_temprana",
  "reactivacion",
  "upgrade_plan",
]);
const TIPOS_PLAN = new Set<TipoPago>(["plan_nuevo", "renovacion", "renovacion_temprana", "reactivacion", "upgrade_plan"]);
// Promociones personales de Mi Cuenta (ver @/lib/helpers/ofertasPlan): a
// diferencia del resto de los tipos, públicos por patente, estas exigen
// sesión de Mi Cuenta y que la patente sea de una de las suyas — no son una
// acción pública como pagar cualquier patente, son un descuento ligado a la
// cuenta autenticada.
const TIPOS_PROMO_CUENTA = new Set<TipoPago>(["renovacion_temprana", "reactivacion", "upgrade_plan"]);
const NOMBRE_PROMO: Record<string, string> = {
  renovacion_temprana: "Renovación anticipada",
  reactivacion: "Reactivación de plan",
  upgrade_plan: "Upgrade a Plan X5",
};

function generarBuyOrder(): string {
  // "wp" + timestamp en base36: siempre corto, cabe en el límite de 26
  // caracteres que exige Transbank para buy_order.
  return "wp" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
}

interface BodyItem {
  tipo?: string;
  servicioId?: string;
  tipoDocumento?: string;
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
  email?: string;
}

interface DatosDocumento {
  tipoDocumento: string | null;
  razonSocial: string | null;
  rut: string | null;
  direccion: string | null;
  giro: string | null;
  email: string | null;
}

interface ItemResuelto extends DatosDocumento {
  tipo: TipoPago;
  servicioId: string | null;
  nombre: string;
  monto: number;
  // Se llena solo en el ítem de plan al que se le aplicó el cupón de la
  // patente — viaja hasta /retorno en pagosWebpayItems.cuponCodigo.
  cuponCodigo?: string;
}

const SIN_DOCUMENTO: DatosDocumento = { tipoDocumento: null, razonSocial: null, rut: null, direccion: null, giro: null, email: null };

// Boleta/Factura son opcionales (compatibilidad con llamadores que no los
// mandan, ej. el flujo de plan vía ResultadoBusqueda): si viene "Factura" se
// exigen los datos de la empresa, mismo criterio que ya usa
// /api/pagos/webpay/crear-empresa para Pack Empresa.
function resolverDocumento(item: BodyItem): { doc: DatosDocumento; error?: string } {
  if (item.tipoDocumento !== "Factura") {
    return item.tipoDocumento === "Boleta" ? { doc: { ...SIN_DOCUMENTO, tipoDocumento: "Boleta" } } : { doc: SIN_DOCUMENTO };
  }
  const razonSocial = (item.razonSocial || "").trim();
  const rutCrudo = (item.rut || "").trim();
  const direccion = (item.direccion || "").trim();
  const giro = (item.giro || "").trim();
  const email = (item.email || "").trim().toLowerCase();
  if (!razonSocial || !rutCrudo || !direccion || !giro || !email) {
    return { doc: SIN_DOCUMENTO, error: "Completa Razón Social, RUT, Giro, Dirección y Correo para la factura" };
  }
  if (!isValidRut(rutCrudo)) {
    return { doc: SIN_DOCUMENTO, error: "RUT inválido" };
  }
  if (!isValidEmail(email)) {
    return { doc: SIN_DOCUMENTO, error: "Correo inválido para la factura" };
  }
  return { doc: { tipoDocumento: "Factura", razonSocial, rut: formatRut(rutCrudo), direccion, giro, email } };
}

export async function POST(request: NextRequest) {
  try {
    if (rateLimited(`pagos-crear:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    let body: { patente?: string; items?: BodyItem[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const patente = normPlate(body.patente);
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
      return NextResponse.json({ error: "Carrito inválido" }, { status: 400 });
    }

    for (const item of body.items) {
      if (!TIPOS_VALIDOS.has(item.tipo as TipoPago)) {
        return NextResponse.json({ error: "Tipo de pago inválido" }, { status: 400 });
      }
    }
    const cantidadPlanes = body.items.filter((i) => TIPOS_PLAN.has(i.tipo as TipoPago)).length;
    if (cantidadPlanes > 1) {
      return NextResponse.json({ error: "Solo se puede pagar un plan por transacción" }, { status: 400 });
    }

    // Las promociones de Mi Cuenta exigen sesión + que la patente sea del
    // cliente logueado, y su precio se recalcula acá con datos frescos (ver
    // calcularOfertasPlanDeCliente) en vez de confiar en nada que mande el
    // cliente — la oferta que vio en pantalla pudo quedar vieja.
    const requierePromoCuenta = body.items.some((i) => TIPOS_PROMO_CUENTA.has(i.tipo as TipoPago));
    let ofertaCliente: Awaited<ReturnType<typeof calcularOfertasPlanDeCliente>> | undefined;
    if (requierePromoCuenta) {
      const sesion = await leerSesionCliente();
      if (!sesion) {
        return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
      }
      const cliente = await buscarClientePorPatente(patente);
      if (!cliente || !sesion.clienteIds.includes(cliente.id)) {
        return NextResponse.json({ error: "Esa patente no pertenece a tu cuenta" }, { status: 403 });
      }
      ofertaCliente = await calcularOfertasPlanDeCliente(cliente);
    }

    // Plan desde /pagar (público, sin sesión): se busca al cliente para
    // respetarle su precio heredado si renueva (ver precioPlanCliente) y para
    // saber si contratar es su 1ra vez (ver precioContratacion) — una patente
    // que no existe es un cliente nuevo, y ahí `null` es la respuesta correcta.
    const hayPlanPublico = body.items.some((i) => i.tipo === "renovacion" || i.tipo === "plan_nuevo");
    const clientePlan = hayPlanPublico ? await buscarClientePorPatente(patente) : undefined;
    // Días de gracia para pagar atrasado (ver enPlazoDePagoPlan): dentro de
    // ese plazo un plan ya vencido se cobra como renovación, con el precio de
    // contratación del cliente respetado.
    const configPlan = hayPlanPublico ? await getConfig() : undefined;

    const db = getDb();
    const filasPrecios = await db.select().from(precios);
    const preciosMap = Object.fromEntries(filasPrecios.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));

    const items: ItemResuelto[] = [];
    for (const item of body.items) {
      const tipo = item.tipo as TipoPago;
      const { doc, error: errorDocumento } = resolverDocumento(item);
      if (errorDocumento) {
        return NextResponse.json({ error: errorDocumento }, { status: 400 });
      }
      if (tipo === "servicio") {
        const [servicio] = await db.select().from(servicios).where(eq(servicios.id, item.servicioId ?? "")).limit(1);
        if (!servicio || !servicio.activo) {
          return NextResponse.json({ error: "Servicio no encontrado" }, { status: 400 });
        }
        items.push({ tipo, servicioId: servicio.id, nombre: servicio.nombre, monto: precioServicio(preciosMap, servicio.id), ...doc });
      } else if (tipo === "lavado_unico") {
        items.push({ tipo, servicioId: null, nombre: "Lavado único", monto: precioLavadoUnicoWeb(preciosMap), ...doc });
      } else if (tipo === "aspirado") {
        items.push({
          tipo,
          servicioId: null,
          nombre: "Uso Zona Aspirado Autoservicio",
          monto: precioZonaAspirado(preciosMap),
          ...doc,
        });
      } else if (TIPOS_PROMO_CUENTA.has(tipo)) {
        const precioPromo =
          tipo === "renovacion_temprana"
            ? ofertaCliente?.renovacionAnticipada?.pPromo
            : tipo === "reactivacion"
              ? ofertaCliente?.reactivacion?.precio
              : ofertaCliente?.upgrade?.precio;
        if (precioPromo === undefined) {
          return NextResponse.json({ error: "Esta promoción ya no está disponible, actualiza la página." }, { status: 400 });
        }
        items.push({ tipo, servicioId: null, nombre: NOMBRE_PROMO[tipo], monto: precioPromo, ...doc });
      } else {
        // "plan_nuevo" paga el precio de contratación (el de 1ra contratación
        // solo si nunca tuvo plan); "renovacion" usa precioRenovacionCliente,
        // el MISMO cálculo que muestran /pagar (vía /api/pagos/estado) y la
        // tarjeta de plan vencido de Mi Cuenta — acá se recalcula con datos
        // frescos, pero tiene que dar el mismo número que vio el cliente.
        const monto =
          tipo === "renovacion"
            ? precioRenovacionCliente(preciosMap, PLANES[0], clientePlan ?? {}, configPlan!.diasGraciaPagoAtrasado)
            : precioContratacion(preciosMap, PLANES[0], clientePlan);
        items.push({ tipo, servicioId: null, nombre: PLANES[0], monto, ...doc });
      }
    }

    // Cupón de descuento atado a la patente (ver buscarCuponDescuentoPlan): se
    // resta del ítem de plan de la compra — TIPOS_PLAN + el chequeo de
    // cantidadPlanes garantizan que hay a lo más uno. A propósito NO se aplica
    // a lavado_unico/servicio/aspirado: ese mismo cupón ya lo descuenta el
    // mesón al pasar por el túnel (ver cuponDescuentoVigente en
    // useOperadorFoundResult), y aplicarlo en los dos lados sería gastarlo dos
    // veces. Recién se marca usado en /retorno, cuando Transbank confirma:
    // hasta entonces el cliente todavía puede abandonar el pago.
    const indicePlan = items.findIndex((i) => TIPOS_PLAN.has(i.tipo));
    if (indicePlan >= 0) {
      const cupon = await buscarCuponDescuentoPlan(patente, db);
      if (cupon) {
        items[indicePlan].monto = precioConCupon(items[indicePlan].monto, cupon);
        items[indicePlan].cuponCodigo = cupon.codigo;
      }
    }

    const montoTotal = items.reduce((sum, i) => sum + i.monto, 0);
    // Separado del chequeo de abajo: NaN/Infinity es un error real de
    // cálculo (500), pero $0 puede ser un precio legítimo (ej. un tramo de
    // promoción configurado a propósito en $0) — Webpay no puede cobrar un
    // monto así, pero no es "se rompió el servidor", así que no corresponde
    // el mismo 500 ni el mismo mensaje.
    if (!Number.isFinite(montoTotal)) {
      return NextResponse.json({ error: "No se pudo calcular el monto a cobrar" }, { status: 500 });
    }
    if (montoTotal <= 0) {
      return NextResponse.json({ error: "El monto a cobrar debe ser mayor a $0" }, { status: 400 });
    }

    const buyOrder = generarBuyOrder();
    const sessionId = "s" + Date.now();
    const returnUrl = new URL("/api/pagos/webpay/retorno", request.nextUrl.origin).toString();

    await db.insert(pagosWebpay).values({
      buyOrder,
      sessionId,
      patente,
      tipo: items.length === 1 ? items[0].tipo : "carrito",
      servicioId: items.length === 1 ? items[0].servicioId : null,
      monto: montoTotal,
      estado: "iniciada",
    });
    await db.insert(pagosWebpayItems).values(
      items.map((item, i) => ({
        id: `${buyOrder}-${i}`,
        buyOrder,
        tipo: item.tipo,
        servicioId: item.servicioId,
        nombre: item.nombre,
        monto: item.monto,
        tipoDocumento: item.tipoDocumento,
        razonSocial: item.razonSocial,
        rut: item.rut,
        direccion: item.direccion,
        giro: item.giro,
        email: item.email,
        cuponCodigo: item.cuponCodigo ?? null,
      }))
    );

    const respuesta = await webpayTransaction().create(buyOrder, sessionId, montoTotal, returnUrl);
    await db.update(pagosWebpay).set({ token: respuesta.token }).where(eq(pagosWebpay.buyOrder, buyOrder));
    return NextResponse.json({ url: respuesta.url, token: respuesta.token });
  } catch (error) {
    console.error("Error en /api/pagos/webpay/crear", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
