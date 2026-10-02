import { NextRequest, NextResponse } from "next/server";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { buscarClientePorPatente, getConfig, obtenerPlantillaWhatsapp, upsertCupones } from "@/lib/dataAccess";
import { fmtCLP, generarCodigoCupon, uid } from "@/lib/helpers";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { PLANTILLA_WHATSAPP_PREMIO_REFERIDO, premiosPendientes } from "@/lib/referidos";
import { construirVariables, enviarSegunPlantilla } from "@/lib/whatsapp/reglas/motor";
import type { Cupon } from "@/types";

export const runtime = "nodejs";

// Disparado por el cron de Vercel (vercel.json). Premia a quien invitó cuando
// el amigo ya usó su cupón de referido — ver @/lib/referidos. Corre una vez al
// día: el premio no necesita llegar al minuto, y un solo lugar que mira
// `usado` cubre los cuatro caminos que cobran un descuento (mesón y web) sin
// tocar ninguno.
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;

  const db = getDb();
  const [usados, premios, existentes, config, plantillaAviso] = await Promise.all([
    db
      .select({ codigo: cupones.codigo, nombreLote: cupones.nombreLote })
      .from(cupones)
      .where(and(like(cupones.nombreLote, "Referido - %"), eq(cupones.usado, true))),
    db.select({ nombreLote: cupones.nombreLote }).from(cupones).where(like(cupones.nombreLote, "Premio referido - %")),
    db.select({ codigo: cupones.codigo }).from(cupones),
    getConfig(),
    // null hasta que Meta apruebe el template y se corra --activar (ver
    // scripts/crear-template-referidos-lavado-unico.mts): mientras tanto el
    // aviso sale solo por correo.
    obtenerPlantillaWhatsapp(PLANTILLA_WHATSAPP_PREMIO_REFERIDO),
  ]);

  const codigos = new Set(existentes.map((r) => r.codigo));
  const pendientes = premiosPendientes(usados, new Set(premios.map((p) => p.nombreLote)));
  let emitidos = 0;

  for (const p of pendientes) {
    const referidor = await buscarClientePorPatente(p.patenteReferidor);
    const email = referidor?.email?.trim().toLowerCase() || undefined;
    const ahora = new Date();
    const codigo = generarCodigoCupon(codigos);
    codigos.add(codigo);
    const premio: Cupon = {
      id: uid(),
      codigo,
      nombreLote: p.nombreLote,
      valor: config.descuentoReferidoValor,
      numeroLote: 1,
      totalLote: 1,
      fechaCaducidad: new Date(ahora.getTime() + config.descuentoReferidoDiasValidez * 86400000).toISOString(),
      usado: false,
      creadoEn: ahora.toISOString(),
      creadoPor: "referidos-cron",
      tipo: "descuento",
      patenteAsignada: p.patenteReferidor,
      // Con el correo queda listado en "Mis tickets y cupones" de Mi Cuenta.
      email,
    };
    if (!(await upsertCupones([premio]))) {
      console.error("No se pudo emitir el premio de referido", p);
      continue;
    }
    emitidos++;

    // El aviso va por WhatsApp (lo que el cliente lee) y por correo solo si no
    // salió el WhatsApp. Si los dos fallan el premio igual existe y se aplica
    // solo al leer la patente. sinComunicacionAuto: mismo opt-out que las
    // reglas de WhatsApp (ver ejecutarAccionRegla).
    let avisadoPorWhatsapp = false;
    if (plantillaAviso?.activo && referidor?.telefono && !referidor.sinComunicacionAuto) {
      const variables = construirVariables({
        cliente: referidor,
        diasValidez: config.descuentoReferidoDiasValidez,
        descuentoReferido: premio.valor,
      });
      const mensaje = await enviarSegunPlantilla(plantillaAviso, referidor.telefono, variables, "referidos-cron");
      avisadoPorWhatsapp = mensaje?.estado === "enviado";
    }
    if (email && !avisadoPorWhatsapp && !referidor?.sinComunicacionAuto) {
      await enviarCorreoTransaccional({
        to: email,
        subject: `Ganaste ${fmtCLP(premio.valor)} de descuento en ZPlash`,
        html: envolverCorreoBase(
          "¡Gracias por recomendarnos!\n\n" +
            "Tu amigo ya usó el descuento que le regalaste, así que te dejamos **{{monto}}** de descuento en la patente {{patente}}.\n\n" +
            "Se aplica solo en tu próximo pago, en el local o por la web.\n\n" +
            "Código de respaldo: **{{codigo}}** — válido hasta el {{fecha}}.",
          {
            monto: fmtCLP(premio.valor),
            patente: p.patenteReferidor,
            codigo,
            fecha: new Date(premio.fechaCaducidad).toLocaleDateString("es-CL"),
          }
        ),
      });
    }
  }

  return NextResponse.json({ ok: true, pendientes: pendientes.length, emitidos });
}
