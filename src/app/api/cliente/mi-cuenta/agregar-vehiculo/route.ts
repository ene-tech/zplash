import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick, ventas } from "@/db/schema";
import { leerSesionCliente, crearSesionCliente } from "@/lib/auth/clienteSession";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { PATENTE_FORMATO_MSG, isValidPatente, normPlate, sigueVigenteHoy, uid } from "@/lib/helpers";

export const runtime = "nodejs";

// A diferencia de SolicitudCambioPatente (que reemplaza la patente de un
// vehículo ya vinculado) esto agrega un vehículo a la cuenta: de cero (sin
// plan, igual que un alta por WhatsApp — ver nuevoCliente en
// @/lib/whatsapp/router.ts) si la patente no existe todavía, o reclamando una
// fila huérfana si existe pero no tiene dueño activo (ver `huerfana` abajo).
// Con dueño activo (email o plan vigente) se sigue bloqueando: dejar que
// cualquiera la sume a su cuenta filtraría su historial de compras y su
// tarjeta guardada a quien solo conoce la patente (visible en el auto). Si la
// patente es realmente suya, tiene que pedir que se la vinculen.
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { patente?: string; nombre?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(body.patente);
  if (!isValidPatente(patente)) {
    return NextResponse.json({ ok: false, error: PATENTE_FORMATO_MSG }, { status: 400 });
  }

  const nombre = (body.nombre || "").trim();
  if (!nombre) {
    return NextResponse.json({ ok: false, error: "Ingresa un nombre referencial para el vehículo" }, { status: 400 });
  }

  // El chequeo de "¿está huérfana?" y la escritura que la reclama corren
  // dentro de una sola transacción con un advisory lock por patente (mismo
  // mecanismo que cobrarSuscripcion/cobrarOfertaOneclick en @/lib/pagos):
  // sin esto, dos cuentas que reclaman la misma patente huérfana casi al
  // mismo tiempo pasaban el chequeo antes de que cualquiera terminara de
  // escribir, y las dos terminaban con `crearSesionCliente` firmando una
  // cookie válida por 30 días sobre el mismo vehículo — exactamente lo que
  // el comentario de más abajo dice que este endpoint previene. El caso de
  // patente nueva (sin fila existente) también queda serializado acá: la
  // segunda llamada concurrente espera el lock, ve la fila que la primera ya
  // insertó y cae al mismo camino de "ya está registrada" en vez de arriesgar
  // el choque de la restricción única de `clientes.patente`.
  const resultado = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${patente}))`);

    const [existenteRow] = await tx.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
    const existente = existenteRow ? clienteFromRow(existenteRow) : null;

    // Sin correo vinculado y sin plan vigente: a primera vista nadie tiene esta
    // ficha controlada hoy (p.ej. un alta por WhatsApp que nunca tuvo cuenta, o
    // un vehículo que su dueño anterior sacó de su cuenta con "Quitar de mi
    // cuenta", que solo limpia el email — ver quitar-vehiculo/route.ts). Pero
    // "Quitar de mi cuenta" deja la tarjeta Oneclick intacta a propósito (sigue
    // cobrándose sola), así que sin este chequeo cualquiera que solo conociera
    // la patente podía reclamar la ficha y luego cobrar la tarjeta guardada del
    // dueño anterior vía /cobrar-oferta (cobrarOfertaOneclick busca la
    // suscripción solo por patente) — y de paso heredar su historial de compras
    // (ver `compras` en /api/cliente/mi-cuenta). Por eso además de "sin dueño
    // activo" se exige que no quede ninguna tarjeta viva ni venta asociada:
    // si hay algo de eso, se cae al mismo camino de "contáctanos" que un dueño
    // activo, aunque el email/plan ya no lo delate.
    let huerfana = !!existente && !existente.email && !sigueVigenteHoy(existente.vencimiento);
    if (huerfana && existente) {
      const [tarjetaViva] = await tx
        .select({ id: suscripcionesOneclick.id })
        .from(suscripcionesOneclick)
        .where(and(eq(suscripcionesOneclick.patente, patente), inArray(suscripcionesOneclick.estado, ["activa", "suspendida"])))
        .limit(1);
      const [ventaPrevia] = await tx.select({ id: ventas.id }).from(ventas).where(eq(ventas.clienteId, existente.id)).limit(1);
      huerfana = !tarjetaViva && !ventaPrevia;
    }
    if (existente && !huerfana) {
      return {
        ok: false as const,
        status: 409,
        error: "Esa patente ya está registrada. Si es tuya, contáctanos para vincularla a tu cuenta.",
      };
    }

    let clienteId: string;
    if (existente) {
      clienteId = existente.id;
      await tx
        .update(clientes)
        .set({ nombre, email: sesion.email, creadoPor: "Portal Cliente (Mi Cuenta)" })
        .where(eq(clientes.id, existente.id));
    } else {
      clienteId = uid();
      await tx.insert(clientes).values({
        id: clienteId,
        nombre,
        patente,
        email: sesion.email,
        plan: "",
        vencimiento: null,
        origen: "LOCAL",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: "Portal Cliente (Mi Cuenta)",
      });
    }
    return { ok: true as const, clienteId };
  });

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  }

  // Igual que en quitar-vehiculo: la sesión guarda la lista de clienteIds
  // firmada en la cookie, así que sin re-firmarla acá el vehículo recién
  // vinculado no aparecería en "Mis vehículos" hasta el próximo login.
  await crearSesionCliente([...sesion.clienteIds, resultado.clienteId], sesion.email);

  return NextResponse.json({ ok: true });
}
