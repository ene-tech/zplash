import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suscripcionesOneclick } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { normPlate, tieneTarjetaViva } from "@/lib/helpers";
import { cancelarSuscripcionOneclick } from "@/lib/dataAccess/oneclick";
import { cortarCobroWooCommerceLegacy } from "@/lib/pagos";
import { WHATSAPP_SUSCRIPCIONES } from "@/lib/whatsapp";
import { evaluarReglasCorreoPorSuscripcionCancelada } from "@/lib/mailing/reglas";

export const runtime = "nodejs";

// A diferencia de quitar-vehiculo (que solo desvincula la patente de la
// cuenta), esto sí da de baja la tarjeta de verdad: reusa
// cancelarSuscripcionOneclick, la misma función que usa el admin desde
// SuscripcionesTab/ClienteInfoModal (da de baja en Transbank vía
// oneclickInscription().delete y marca "cancelada" localmente).
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: { patente?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(body.patente);
  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  const cliente = clientesEncontrados.find((c) => normPlate(c.patente) === patente);
  if (!cliente) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const db = getDb();
  const [suscripcion] = await db.select().from(suscripcionesOneclick).where(eq(suscripcionesOneclick.patente, patente)).limit(1);
  if (!suscripcion || !tieneTarjetaViva(suscripcion.estado)) {
    return NextResponse.json({ ok: false, error: "No tienes una tarjeta guardada para ese vehículo" }, { status: 404 });
  }

  await cancelarSuscripcionOneclick(suscripcion.id);

  // El que arrastra la suscripción vieja de WooCommerce tiene DOS cobros
  // automáticos, y darle de baja solo el Oneclick lo dejaba pagando por allá
  // con un correo que le decía que había quedado cancelado. Va DESPUÉS de la
  // tarjeta a propósito: cancelar en Woo no se deshace, y si después fallara
  // Transbank el cliente quedaría sin su renovación y sin forma de recuperarla
  // desde acá.
  const woo = await cortarCobroWooCommerceLegacy(cliente, patente, "el cliente eliminó su tarjeta desde Mi Cuenta");

  // Solo se corta el flujo si el cliente venía de WooCommerce: ahí un error
  // significa que le siguen cobrando, y prefiere saberlo a recibir el correo
  // de "listo, ya no se te cobra". Al resto, un WooCommerce caído no puede
  // impedirle eliminar su tarjeta.
  if (woo === "error" && cliente.renovacionAutoWooDesde) {
    return NextResponse.json(
      { ok: false, error: `Dimos de baja tu tarjeta, pero no pudimos cortar tu renovación automática anterior. Escríbenos al ${WHATSAPP_SUSCRIPCIONES} para cerrarla.` },
      { status: 502 }
    );
  }

  // El mismo correo de respaldo que manda anularSuscripcion (@/lib/serverActions/
  // oneclick) cuando la baja la hace el admin desde la ficha: el cliente que se
  // da de baja solo también necesita su comprobante, y es la misma ReglaCorreo
  // ("suscripcion_cancelada") para no tener dos textos que mantener. En after()
  // para no hacerle esperar el envío, igual que el resto de los correos de reglas.
  after(() => evaluarReglasCorreoPorSuscripcionCancelada(cliente));
  return NextResponse.json({ ok: true });
}
