import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { clientes, cupones } from "@/db/schema";
import { esEmailEnviable, fmtFecha, generarCodigoCupon, uid } from "@/lib/helpers";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";

/** Nombre del lote de la promo — agrupa los tickets en B2B/Tickets y en "Mis
 * tickets y cupones" del Portal Cliente, y es la clave con la que se
 * reconoce si el cliente ya la usó (ver abajo). */
export const LOTE_TICKET_REACTIVACION = "Promo Reactivación Web";

/** 30 días corridos desde el registro de la tarjeta. */
export const DIAS_TICKET_REACTIVACION = 30;

function htmlTicket(nombre: string, codigo: string, caducidad: string): string {
  return envolverHtmlBase(`
    <p style="margin:0 0 20px;">Hola ${nombre}, gracias por reactivar tu plan con pago automático. Te regalamos un <strong>lavado full túnel gratis</strong>.</p>
    <p style="margin:0 0 8px;">Tu ticket es:</p>
    <p style="margin:0 0 20px; font-size:32px; font-weight:bold; letter-spacing:8px; color:#262320;">${codigo}</p>
    <p style="margin:0 0 20px;">Lo puedes usar en <strong>cualquier vehículo</strong>: solo muéstralo en el local antes del <strong>${caducidad}</strong>.</p>
    <p style="margin:0;">También lo tienes siempre a mano en &quot;Mis tickets y cupones&quot;, dentro de Mi Cuenta.</p>
  `);
}

/**
 * Promoción: registrar una tarjeta de pago automático (Oneclick) teniendo el
 * plan vencido deja 1 ticket de lavado full túnel gratis. UNA sola vez por
 * cliente — quien ya la usó y vuelve a inscribir tarjeta no gana otro, por
 * eso devuelve `null` en vez del código.
 *
 * El ticket es un cupón "vale" suelto, lo mismo que uno de un Pack Empresa
 * (ver aplicarPagoPackEmpresa), pero sin `patentesAutorizadas`: lo canjea
 * cualquier vehículo (ver patenteAutorizadaParaCupon), no solo el auto que
 * reactivó. `valor` 0 porque no lo pagó nadie, es cortesía (el admin lo ve
 * como "Gratis", ver valorCupon).
 *
 * `patenteAsignada` acá NO restringe el canje (para un "vale" eso lo decide
 * `patentesAutorizadas`): solo deja anotado qué patente ganó el ticket, que
 * es la mitad de la clave del "una sola vez". La otra mitad es el correo,
 * para que un cliente con varios autos vencidos no cobre la promo una vez
 * por cada uno. Sin correo en la ficha queda solo la patente — es lo que hay,
 * y es justo el caso que no puede autenticarse en Mi Cuenta igual.
 *
 * El correo de confirmación va por `after()`: el ticket ya está emitido y
 * visible en Mi Cuenta, así que un fallo de Resend no puede demorar ni tumbar
 * la vuelta del cliente desde Transbank.
 */
/**
 * ¿Esta patente (o el correo de su ficha) ya ganó el ticket de la promo? Es
 * la mitad "una sola vez por cliente" de otorgarTicketReactivacion, aparte
 * para que /api/pagos/estado pueda anunciarlo en /pagar solo cuando de
 * verdad le queda — prometer un lavado gratis que después no se emite es
 * peor que no ofrecerlo.
 */
export async function yaTieneTicketReactivacion(patente: string, email: string): Promise<boolean> {
  const [fila] = await getDb()
    .select({ id: cupones.id })
    .from(cupones)
    .where(
      and(
        eq(cupones.nombreLote, LOTE_TICKET_REACTIVACION),
        email ? or(eq(cupones.patenteAsignada, patente), sql`lower(${cupones.email}) = ${email}`) : eq(cupones.patenteAsignada, patente)
      )
    )
    .limit(1);
  return !!fila;
}

export async function otorgarTicketReactivacion(opts: {
  patente: string;
  email?: string | null;
  creadoPor: string;
}): Promise<string | null> {
  const db = getDb();
  const [cliente] = await db
    .select({ id: clientes.id, nombre: clientes.nombre, email: clientes.email })
    .from(clientes)
    .where(eq(clientes.patente, opts.patente))
    .limit(1);
  const email = (cliente?.email || opts.email || "").trim().toLowerCase();

  if (await yaTieneTicketReactivacion(opts.patente, email)) return null;

  const existentes = await db.select({ codigo: cupones.codigo }).from(cupones);
  const codigo = generarCodigoCupon(new Set(existentes.map((r) => r.codigo)));

  const ahora = new Date();
  const fechaCaducidad = new Date(ahora.getTime() + DIAS_TICKET_REACTIVACION * 86400000).toISOString();
  await db.insert(cupones).values({
    id: uid(),
    codigo,
    nombreLote: LOTE_TICKET_REACTIVACION,
    valor: 0,
    numeroLote: 1,
    totalLote: 1,
    fechaCaducidad,
    usado: false,
    creadoEn: ahora.toISOString(),
    creadoPor: opts.creadoPor,
    tipo: "vale",
    patenteAsignada: opts.patente,
    email: email || null,
  });

  if (esEmailEnviable(email)) {
    after(() =>
      enviarCorreoTransaccional({
        to: email,
        subject: `Tu lavado full túnel gratis — ticket ${codigo}`,
        html: htmlTicket(cliente?.nombre || "", codigo, fmtFecha(fechaCaducidad)),
        clienteId: cliente?.id,
      }).catch((error) => console.error("Error enviando el correo del ticket de reactivación", opts.patente, error))
    );
  }

  return codigo;
}
