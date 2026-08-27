import { NextRequest, NextResponse } from "next/server";
import { isValidPatente, normPlate } from "@/lib/helpers";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { buscarClientePorPatente } from "@/lib/dataAccess/clientes";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { cobrarOfertaOneclick, otorgarTicketReactivacion, type TipoOfertaCuenta } from "@/lib/pagos";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 10;
const VENTANA_MS = 5 * 60 * 1000;

const TIPOS_VALIDOS = new Set<TipoOfertaCuenta>(["renovacion_temprana", "reactivacion", "upgrade_plan"]);

// Cobra una de las 3 promociones de Mi Cuenta (ver @/lib/helpers/ofertasPlan)
// directo contra la tarjeta que esa patente ya tiene inscrita en Oneclick —
// alternativa a /api/pagos/webpay/crear para cuando el cliente ya tiene
// tarjeta guardada: sin redirección a Webpay Plus, un solo click cobra. Si no
// tiene tarjeta activa, useOfertaPlan cae de vuelta al flujo de Webpay.
export async function POST(request: NextRequest) {
  try {
    if (rateLimited(`cobrar-oferta:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    const sesion = await leerSesionCliente();
    if (!sesion) {
      return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    }

    let body: { patente?: string; tipo?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const patente = normPlate(body.patente);
    if (!isValidPatente(patente)) {
      return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
    }
    if (!TIPOS_VALIDOS.has(body.tipo as TipoOfertaCuenta)) {
      return NextResponse.json({ error: "Tipo de promoción inválido" }, { status: 400 });
    }
    const tipo = body.tipo as TipoOfertaCuenta;

    const cliente = await buscarClientePorPatente(patente);
    if (!cliente || !sesion.clienteIds.includes(cliente.id)) {
      return NextResponse.json({ error: "Esa patente no pertenece a tu cuenta" }, { status: 403 });
    }

    // Igual que /api/pagos/webpay/crear: el monto se recalcula acá con datos
    // frescos, nunca se confía en la oferta que el cliente vio en pantalla.
    const oferta = await calcularOfertasPlanDeCliente(cliente);
    const monto =
      tipo === "renovacion_temprana" ? oferta.renovacionAnticipada?.pPromo : tipo === "reactivacion" ? oferta.reactivacion?.precio : oferta.upgrade?.precio;
    if (monto === undefined) {
      return NextResponse.json({ error: "Esta promoción ya no está disponible, actualiza la página." }, { status: 400 });
    }
    // Mismo criterio que /api/pagos/webpay/crear: nunca mandar un monto <= 0
    // a Transbank (comportamiento no definido para un cobro con tarjeta) — a
    // diferencia de ese endpoint, acá antes no había ningún chequeo y un
    // tramo de promoción configurado en $0 pasaba directo a
    // cobrarOfertaOneclick, que lo enviaba tal cual a oneclickTransaction().authorize().
    if (monto <= 0) {
      return NextResponse.json({ error: "El monto a cobrar debe ser mayor a $0" }, { status: 400 });
    }

    try {
      const { estado } = await cobrarOfertaOneclick(patente, tipo, monto);
      if (estado === "aprobada" && tipo === "reactivacion") {
        // El mismo ticket de lavado gratis que emite inscribir la tarjeta
        // desde /pagar (ver /api/pagos/oneclick/inscripcion/retorno): esto es
        // el mismo hecho —plan vencido reactivado contra una tarjeta de pago
        // automático—, solo que el cliente guardó la tarjeta antes desde "Mis
        // tarjetas" en vez de inscribirla en el mismo pago. Sin esto la promo
        // dependía de por cuál de las dos puertas entró. otorgarTicketReactivacion
        // es una sola vez por cliente, así que no puede duplicar el del otro
        // camino, y un fallo acá no puede tumbar un cobro ya hecho: se
        // registra y se sigue.
        try {
          await otorgarTicketReactivacion({ patente, email: cliente.email, creadoPor: "Promo reactivación (Mi Cuenta)" });
        } catch (error) {
          console.error("No se pudo emitir el ticket de la promo de reactivación", patente, error);
        }
      }
      return NextResponse.json({ ok: true, estado });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "No se pudo cobrar la tarjeta";
      return NextResponse.json({ error: mensaje }, { status: 400 });
    }
  } catch (error) {
    console.error("Error en /api/cliente/mi-cuenta/cobrar-oferta", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
