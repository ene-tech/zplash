import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick } from "@/db/schema";
import { requiereValidacionX5 } from "@/lib/helpers";
import { cobrarSuscripcion } from "@/lib/pagos";

export const runtime = "nodejs";
// Cada suscripción es un viaje a Transbank en serie (~2-5s). Con el default
// de la plataforma, una tanda grande se corta a la mitad y las suscripciones
// que quedaron al final de la lista no se cobran nunca — el cron vuelve a
// armar la misma lista al día siguiente y las vuelve a dejar fuera.
export const maxDuration = 300;

// Disparado por el cron de Vercel (vercel.json) una vez al día. Vercel manda
// automáticamente "Authorization: Bearer $CRON_SECRET" en la llamada cuando
// esa env var está configurada en el proyecto.
//
// GET, no POST: el cron de Vercel siempre invoca la ruta con GET. Mientras
// esto exportaba solo POST, la llamada diaria recibía 405 y ningún cobro
// automático se ejecutaba nunca — los únicos cobros que había eran los del
// primer cargo al inscribir la tarjeta (ago-2026: 10 suscripciones activas
// con proximoCobro vencido y cero filas en cobros_oneclick).
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const db = getDb();
  const ahora = new Date().toISOString();
  // Se trae también el plan/vencimiento del cliente: las dos decisiones de
  // abajo (candado del X5 y plan ya pagado) son sobre el cliente, no sobre la
  // suscripción. Van acá y no en cobrarSuscripcion() porque este es el único
  // camino que cobra sin que nadie lo pida en el momento — los otros tres
  // (primer cobro al inscribir, oferta desde Mi Cuenta, reintento manual del
  // operador) son cobros que alguien apretó recién y sí deben salir aunque el
  // plan siga vigente.
  const filas = await db
    .select({
      suscripcion: suscripcionesOneclick,
      plan: clientes.plan,
      aceptoX5En: clientes.aceptoX5En,
      vencimiento: clientes.vencimiento,
    })
    .from(suscripcionesOneclick)
    .leftJoin(clientes, eq(clientes.patente, suscripcionesOneclick.patente))
    // Las "pausada_validacion_x5" entran a propósito: ver el candado más abajo.
    .where(
      and(
        inArray(suscripcionesOneclick.estado, ["activa", "pausada_validacion_x5"]),
        lte(suscripcionesOneclick.proximoCobro, ahora)
      )
    )
    // Deuda más vieja primero: si la tanda se corta, que lo que quede sin
    // cobrar sea lo recién vencido y no lo que lleva semanas esperando.
    .orderBy(asc(suscripcionesOneclick.proximoCobro));

  const resultados: { suscripcionId: string; patente: string; estado?: string; error?: string }[] = [];
  for (const { suscripcion, ...cliente } of filas) {
    // Candado del paso al X5 (ver cobrarSuscripcion): al cliente del ilimitado
    // viejo que no aceptó el cambio no se le cobra, y su suscripción queda
    // pausada. Se revisa de nuevo cada día porque el candado se levanta por
    // fuera: renovar en el mesón migra al cliente al X5 igual que la web, pero
    // no pasa por registrarAceptacionX5 — antes de esto la suscripción se
    // quedaba pausada para siempre, sin cobrar nunca más y sin que el cliente
    // ni el operador se enteraran (sep-2026: THRP23 pausada el día que vencía,
    // cobrada a mano en el mesón, y el mes siguiente iba a fallar igual).
    //
    // Si el candado sigue puesto no se salta la fila: pasa igual por
    // cobrarSuscripcion, que la vuelve a pausar sin cobrar (nunca llama a
    // Transbank) y de ahí sale el aviso al cliente — uno por ciclo, ver
    // evaluarReglasCorreoPorValidacionX5.
    if (suscripcion.estado === "pausada_validacion_x5" && !requiereValidacionX5(cliente)) {
      await db
        .update(suscripcionesOneclick)
        .set({ estado: "activa", actualizadoEn: new Date().toISOString() })
        .where(eq(suscripcionesOneclick.id, suscripcion.id));
    }

    // Plan ya pagado por otra vía (mesón, Webpay, WooCommerce) y todavía
    // vigente: no se le cobra encima al cliente, solo se corre el cobro
    // automático hasta el vencimiento real — el mismo criterio con que
    // /inscripcion/retorno agenda proximoCobro al guardar una tarjeta.
    if (cliente.vencimiento && new Date(cliente.vencimiento) > new Date(ahora)) {
      await db
        .update(suscripcionesOneclick)
        .set({ proximoCobro: cliente.vencimiento, actualizadoEn: new Date().toISOString() })
        .where(eq(suscripcionesOneclick.id, suscripcion.id));
      resultados.push({ suscripcionId: suscripcion.id, patente: suscripcion.patente, estado: "reagendada" });
      continue;
    }

    try {
      const { estado } = await cobrarSuscripcion(suscripcion);
      resultados.push({ suscripcionId: suscripcion.id, patente: suscripcion.patente, estado });
    } catch (error) {
      console.error("Error cobrando suscripción Oneclick", suscripcion.id, error);
      resultados.push({ suscripcionId: suscripcion.id, patente: suscripcion.patente, error: "error" });
    }
  }

  return NextResponse.json({ ok: true, procesadas: resultados.length, resultados });
}
