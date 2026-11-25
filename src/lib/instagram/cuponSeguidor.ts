import "server-only";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, cuponesInstagram, mensajesSms, otpsCliente, suscripcionesOneclick, ventas } from "@/db/schema";
import { enviarCorreo } from "@/lib/buzon/enviar";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { insertAuditoria } from "@/lib/dataAccess/auditoria";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { rateLimited } from "@/lib/rateLimit";
import {
  ESTADOS_TARJETA_VIVA,
  PATENTE_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  esCorreoDeRelleno,
  esEmailEnviable,
  finDelDiaSantiago,
  formatTelefono,
  generarCodigoCupon,
  isValidPatente,
  isValidTelefono,
  normPlate,
  sigueVigenteHoy,
  uid,
} from "@/lib/helpers";
import { enviarDmInstagram, perfilInstagram } from "./graph";

// Descuento por seguir a @zplash en Instagram (nov-2026). Se sube una historia
// que pide "síguenos y responde ZPLASH"; la respuesta llega como DM al webhook
// (/api/instagram/webhook), que revisa si la persona nos sigue y le manda su
// link personal zplash.cl/ig/CODIGO. En el link pone su patente: si no tiene
// ficha se registra, y si la ficha tiene el celular o el correo malos los
// corrige. Recién ahí se crea el cupón de $2.000, solo web, por 15 días, y el
// mismo código pasa a abrir el pago de un toque de /v/CODIGO.
//
// Una vez por cuenta de Instagram y una vez por patente (ver cuponesInstagram).
//
// Seguridad: Mi Cuenta abre todas las fichas con el mismo correo, así que
// escribir un correo en una ficha es darle esa ficha a quien lo controle. Por
// eso el correo nuevo se confirma con un código de 6 dígitos, solo se escribe
// cuando el de la ficha falta o es inservible (nunca se pisa uno bueno), y
// nunca en una ficha que ya es de alguien (ver fichaConDueno): esas reciben el
// cupón sin que se les toque nada. Por lo mismo el link de Instagram no abre
// el cobro de un toque ni muestra el nombre (ver resolverLinkSms): quien lo
// activa puede no ser el dueño de la patente.

export const LOTE_CUPON_INSTAGRAM = "Instagram - Seguidor";
export const VALOR_CUPON_INSTAGRAM = 2000;
export const DIAS_CUPON_INSTAGRAM = 15;
const USUARIO = "Instagram";

const ALFABETO_LINK = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DURACION_CODIGO_MS = 10 * 60 * 1000;
const LIMITE_INTENTOS_CODIGO = 5;

export function urlLinkInstagram(codigo: string): string {
  return `https://zplash.cl/ig/${codigo}`;
}

/** El DM pide el descuento: es la palabra ZPLASH sola (con signos o emojis
 * alrededor). Una pregunta que nombra la marca o la web ("zplash.cl no
 * carga") la sigue contestando una persona. */
export function pideDescuentoInstagram(texto: string | null | undefined): boolean {
  return /^[^\p{L}\p{N}]*zplash[^\p{L}\p{N}]*$/iu.test((texto || "").trim());
}

export const TEXTO_NO_SIGUE =
  "¡Hola! Para recibir tus $2.000 de descuento primero síguenos en Instagram y vuelve a escribirnos ZPLASH.";

export function textoLinkInstagram(codigo: string): string {
  return (
    `¡Gracias por seguirnos! Activa aquí tus $2.000 de descuento para tu Lavado Full Túnel o tu plan, pagando en la web: ${urlLinkInstagram(codigo)}\n\n` +
    `Vale ${DIAS_CUPON_INSTAGRAM} días desde que lo actives.`
  );
}

export function textoYaActivado(codigo: string, patente: string): string {
  return `Ya activaste tu descuento de Instagram para la patente ${patente}. Puedes usarlo aquí: https://zplash.cl/v/${codigo}`;
}

async function generarCodigoLink(): Promise<string> {
  const db = getDb();
  for (let i = 0; i < 10; i++) {
    const bytes = crypto.randomBytes(8);
    const codigo = Array.from(bytes, (b) => ALFABETO_LINK[b % ALFABETO_LINK.length]).join("");
    // Comparte el formato con el link de los SMS (resolverLinkSms prueba los
    // dos): no puede repetir ninguno.
    const [enIg] = await db.select({ c: cuponesInstagram.codigo }).from(cuponesInstagram).where(eq(cuponesInstagram.codigo, codigo)).limit(1);
    const [enSms] = await db.select({ c: mensajesSms.codigoBaja }).from(mensajesSms).where(eq(mensajesSms.codigoBaja, codigo)).limit(1);
    if (!enIg && !enSms) return codigo;
  }
  throw new Error("No se pudo generar un código de link de Instagram libre");
}

/** Contesta un DM de Instagram. Solo actúa si trae ZPLASH: el resto de los DM
 * los sigue atendiendo una persona desde la app de Instagram. */
export async function atenderDmInstagram(igId: string, texto: string): Promise<void> {
  if (!pideDescuentoInstagram(texto)) return;
  // Meta reintenta el webhook y la gente insiste: con unas pocas respuestas
  // por cuenta cada 10 minutos alcanza.
  if (await rateLimited(`instagram-dm:${igId}`, 4, 10 * 60 * 1000)) return;

  const perfil = await perfilInstagram(igId);
  if (!perfil.sigue) {
    await enviarDmInstagram(igId, TEXTO_NO_SIGUE);
    return;
  }

  const db = getDb();
  let [fila] = await db.select().from(cuponesInstagram).where(eq(cuponesInstagram.igId, igId)).limit(1);
  if (!fila) {
    await db
      .insert(cuponesInstagram)
      .values({ igId, igUsuario: perfil.usuario, codigo: await generarCodigoLink() })
      .onConflictDoNothing();
    [fila] = await db.select().from(cuponesInstagram).where(eq(cuponesInstagram.igId, igId)).limit(1);
  }
  await enviarDmInstagram(igId, fila.activadoEn && fila.patente ? textoYaActivado(fila.codigo, fila.patente) : textoLinkInstagram(fila.codigo));
}

export async function resolverLinkInstagram(codigoCrudo: string | null | undefined) {
  const codigo = (codigoCrudo || "").toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(codigo)) return null;
  const [fila] = await getDb().select().from(cuponesInstagram).where(eq(cuponesInstagram.codigo, codigo)).limit(1);
  return fila ?? null;
}

export interface DatosFaltantes {
  nombre: boolean;
  telefono: boolean;
  email: boolean;
}

/** Qué hay que pedirle antes de darle el cupón. Sin ficha, todo. */
export function datosQueFaltan(c: { nombre?: string | null; telefono?: string | null; email?: string | null } | null): DatosFaltantes {
  if (!c) return { nombre: true, telefono: true, email: true };
  return {
    nombre: !c.nombre?.trim() || c.nombre.trim() === "Cliente Web",
    telefono: !c.telefono?.trim() || !isValidTelefono(c.telefono),
    email: !c.email?.trim() || !esEmailEnviable(c.email) || esCorreoDeRelleno(c.email),
  };
}

function algunoFalta(f: DatosFaltantes): boolean {
  return f.nombre || f.telefono || f.email;
}

export interface EntradaCanje {
  patente: string;
  nombre?: string;
  telefono?: string;
  email?: string;
  solicitudId?: string;
  codigoVerificacion?: string;
}

export type ResultadoCanje =
  | { estado: "listo"; codigo: string }
  | { estado: "datos"; faltan: DatosFaltantes; nuevo: boolean }
  | { estado: "codigo"; solicitudId: string; email: string }
  | { estado: "error"; error: string };

const MSG_PATENTE_USADA = "Esta patente ya recibió su descuento de Instagram.";

function enmascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  return `${usuario.slice(0, 1)}${"*".repeat(Math.max(usuario.length - 1, 1))}@${dominio}`;
}

type Db = Pick<ReturnType<typeof getDb>, "select">;

/** La ficha ya es de alguien: plan vigente, alguna compra o tarjeta Oneclick
 * viva. Mismo criterio que vincularPatenteACuenta (@/lib/dataAccess/clientes)
 * para no dejar reclamar una ficha: quien solo sabe la patente no puede
 * escribirle datos, porque el correo abre Mi Cuenta con su historial, su plan
 * y su tarjeta. A esas fichas se les da el cupón sin tocarlas; los datos malos
 * los corrige el mesón o el propio cliente en "Mis datos". */
async function fichaConDueno(db: Db, ficha: { id: string; patente?: string | null; vencimiento?: string | null }): Promise<boolean> {
  if (sigueVigenteHoy(ficha.vencimiento)) return true;
  const [venta] = await db.select({ id: ventas.id }).from(ventas).where(eq(ventas.clienteId, ficha.id)).limit(1);
  if (venta) return true;
  if (!ficha.patente) return false;
  const [tarjeta] = await db
    .select({ id: suscripcionesOneclick.id })
    .from(suscripcionesOneclick)
    .where(and(eq(suscripcionesOneclick.patente, ficha.patente), inArray(suscripcionesOneclick.estado, ESTADOS_TARJETA_VIVA)))
    .limit(1);
  return !!tarjeta;
}

const NADA_FALTA: DatosFaltantes = { nombre: false, telefono: false, email: false };

async function buscarFicha(patente: string) {
  const [row] = await getDb().select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
  return row ? clienteFromRow(row) : null;
}

async function enviarCodigoVerificacion(email: string, codigo: string) {
  return enviarCorreo({
    para: [email],
    asunto: `${codigo} es tu código para activar tu descuento de Instagram`,
    html: envolverHtmlBase(
      `
      <p style="margin:0 0 20px;">Tu código para activar el descuento de <strong>$2.000</strong> es:</p>
      <p style="margin:0 0 20px; font-size:32px; font-weight:bold; letter-spacing:8px; color:#262320;">${codigo}</p>
      <p style="margin:0;">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p>
      `,
      { boton: false }
    ),
  });
}

/** Un paso de la activación desde /ig/CODIGO. Se llama varias veces con más
 * datos cada vez: patente → (datos que falten) → (código del correo) → listo.
 * Lo que falta se recalcula siempre acá, nunca se confía en lo que diga la
 * página. */
export async function canjearLinkInstagram(codigoLink: string, entrada: EntradaCanje): Promise<ResultadoCanje> {
  const link = await resolverLinkInstagram(codigoLink);
  if (!link) return { estado: "error", error: "Este link no existe. Escríbenos ZPLASH por Instagram para recibir uno." };
  if (link.activadoEn) return { estado: "listo", codigo: link.codigo };

  const patente = normPlate(entrada.patente);
  if (!isValidPatente(patente)) return { estado: "error", error: PATENTE_FORMATO_MSG };
  const [usada] = await getDb()
    .select({ c: cuponesInstagram.codigo })
    .from(cuponesInstagram)
    .where(eq(cuponesInstagram.patente, patente))
    .limit(1);
  if (usada) return { estado: "error", error: MSG_PATENTE_USADA };

  const ficha = await buscarFicha(patente);
  if (ficha?.nonGrato) return { estado: "error", error: "Este descuento no está disponible para esta patente. Comunícate con el local." };
  const faltan = ficha && (await fichaConDueno(getDb(), ficha)) ? NADA_FALTA : datosQueFaltan(ficha);

  const nombre = (entrada.nombre || "").trim().slice(0, 80);
  const telefono = formatTelefono(entrada.telefono);
  const email = (entrada.email || "").trim().toLowerCase();
  if ((faltan.nombre && !nombre) || (faltan.telefono && !entrada.telefono?.trim()) || (faltan.email && !email)) {
    return { estado: "datos", faltan, nuevo: !ficha };
  }
  if (faltan.telefono && !isValidTelefono(telefono)) return { estado: "error", error: TELEFONO_FORMATO_MSG };
  if (faltan.email && (!esEmailEnviable(email) || esCorreoDeRelleno(email))) {
    return { estado: "error", error: "Revisa tu correo: tiene que ser uno donde recibas mensajes." };
  }

  if (faltan.email) {
    const db = getDb();
    if (!entrada.solicitudId) {
      if (await rateLimited(`instagram-otp:${email}`, 4, 10 * 60 * 1000)) {
        return { estado: "error", error: "Pediste muchos códigos para este correo, espera unos minutos." };
      }
      const codigo = String(crypto.randomInt(100000, 1000000));
      const solicitudId = uid();
      await db.insert(otpsCliente).values({
        id: solicitudId,
        email,
        codigoHash: await bcrypt.hash(codigo, 10),
        expiraEn: new Date(Date.now() + DURACION_CODIGO_MS).toISOString(),
      });
      const envio = await enviarCodigoVerificacion(email, codigo);
      if (!envio.ok) return { estado: "error", error: "No pudimos enviarte el código por correo, intenta de nuevo." };
      return { estado: "codigo", solicitudId, email: enmascararEmail(email) };
    }
    // El intento se cuenta antes de comparar y en un solo UPDATE: con requests
    // en paralelo no se pasa del límite (mismo patrón que datos-contacto).
    const [otp] = await db
      .update(otpsCliente)
      .set({ intentos: sql`${otpsCliente.intentos} + 1` })
      .where(
        and(
          eq(otpsCliente.id, entrada.solicitudId),
          isNull(otpsCliente.usadoEn),
          sql`${otpsCliente.intentos} < ${LIMITE_INTENTOS_CODIGO}`,
          sql`${otpsCliente.expiraEn} > now()`
        )
      )
      .returning();
    // El correo tiene que ser el mismo al que se mandó el código.
    if (!otp || otp.email !== email) return { estado: "error", error: "El código venció. Pide uno nuevo." };
    if (!/^\d{6}$/.test(entrada.codigoVerificacion || "") || !(await bcrypt.compare(entrada.codigoVerificacion!, otp.codigoHash))) {
      return { estado: "error", error: "Código incorrecto." };
    }
    const [consumido] = await db
      .update(otpsCliente)
      .set({ usadoEn: new Date().toISOString() })
      .where(and(eq(otpsCliente.id, otp.id), isNull(otpsCliente.usadoEn)))
      .returning({ id: otpsCliente.id });
    if (!consumido) return { estado: "error", error: "El código venció. Pide uno nuevo." };

    // Si la activación no termina, el código vuelve a servir para reintentar.
    const liberar = () => db.update(otpsCliente).set({ usadoEn: null }).where(eq(otpsCliente.id, otp.id));
    try {
      const r = await activar(link.igId, patente, { nombre, telefono, email }, faltan);
      if (r.estado !== "listo") await liberar();
      return r;
    } catch (error) {
      await liberar();
      throw error;
    }
  }

  return activar(link.igId, patente, { nombre, telefono, email }, faltan);
}

/** `pedidos` es lo que se le pidió (y, el correo, se verificó) en el paso
 * anterior: solo eso se escribe. Si bajo el candado resulta que falta algo
 * más, se vuelve a pedir. */
async function activar(
  igId: string,
  patente: string,
  datos: { nombre: string; telefono: string; email: string },
  pedidos: DatosFaltantes
): Promise<ResultadoCanje> {
  const ahora = new Date();
  const existentes = await getDb().select({ codigo: cupones.codigo }).from(cupones);
  const codigoCupon = generarCodigoCupon(new Set(existentes.map((r) => r.codigo)));

  try {
    const r = await getDb().transaction(async (tx) => {
      const [link] = await tx.select().from(cuponesInstagram).where(eq(cuponesInstagram.igId, igId)).for("update");
      if (link.activadoEn) return { resultado: { estado: "listo", codigo: link.codigo } as ResultadoCanje };
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${patente}))`);

      // Releída bajo el candado: entre el primer paso y este alguien pudo
      // crear la ficha o corregirle los datos.
      const [row] = await tx.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
      const ficha = row ? clienteFromRow(row) : null;
      const faltan = ficha && (await fichaConDueno(tx, ficha)) ? NADA_FALTA : datosQueFaltan(ficha);
      if ((faltan.nombre && !pedidos.nombre) || (faltan.telefono && !pedidos.telefono) || (faltan.email && !pedidos.email)) {
        return { resultado: { estado: "datos", faltan, nuevo: !ficha } as ResultadoCanje };
      }

      let clienteId: string;
      let auditoria: Parameters<typeof insertAuditoria>[0] = [];
      if (!ficha) {
        clienteId = uid();
        const nueva = {
          id: clienteId,
          nombre: datos.nombre,
          patente,
          telefono: datos.telefono,
          email: datos.email,
          plan: "",
          vencimiento: null,
          origen: "WEB",
          visitas: 0,
          creadoEn: ahora.toISOString(),
          creadoPor: USUARIO,
        };
        await tx.insert(clientes).values(nueva);
        auditoria = [{ tabla: "clientes", registroId: clienteId, accion: "insert", datosAnteriores: null, datosNuevos: nueva, usuario: USUARIO }];
      } else {
        clienteId = ficha.id;
        const cambios: { nombre?: string; telefono?: string; email?: string } = {};
        if (faltan.nombre) cambios.nombre = datos.nombre;
        if (faltan.telefono) cambios.telefono = datos.telefono;
        if (faltan.email) cambios.email = datos.email;
        if (Object.keys(cambios).length) {
          await tx.update(clientes).set(cambios).where(eq(clientes.id, clienteId));
          const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, ficha[k as keyof typeof cambios] || null]));
          auditoria = [{ tabla: "clientes", registroId: clienteId, accion: "update", datosAnteriores: antes, datosNuevos: cambios, usuario: USUARIO }];
        }
      }

      await tx.insert(cupones).values({
        id: uid(),
        codigo: codigoCupon,
        nombreLote: LOTE_CUPON_INSTAGRAM,
        valor: VALOR_CUPON_INSTAGRAM,
        numeroLote: 1,
        totalLote: 1,
        fechaCaducidad: finDelDiaSantiago(new Date(ahora.getTime() + DIAS_CUPON_INSTAGRAM * 86400000)),
        usado: false,
        creadoEn: ahora.toISOString(),
        creadoPor: USUARIO,
        tipo: "descuento",
        patenteAsignada: patente,
        canal: "web",
        // El correo tipeado solo si se verificó; si no, el de la ficha.
        email: (faltan.email ? datos.email : ficha?.email) || null,
      });
      await tx
        .update(cuponesInstagram)
        .set({ patente, clienteId, cuponCodigo: codigoCupon, activadoEn: ahora.toISOString() })
        .where(eq(cuponesInstagram.igId, igId));
      return { resultado: { estado: "listo", codigo: link.codigo } as ResultadoCanje, auditoria };
    });
    if (r.auditoria?.length) await insertAuditoria(r.auditoria);
    return r.resultado;
  } catch (error) {
    // Otra cuenta de Instagram activó esta patente al mismo tiempo (índice
    // único de cupones_instagram.patente). Otro choque (la ficha la creó otro
    // flujo justo ahora) es un error común: reintentar lo resuelve.
    const pg = (error as { cause?: { code?: string; constraint_name?: string } })?.cause ?? (error as { code?: string; constraint_name?: string });
    if (pg?.code === "23505" && pg.constraint_name === "cupones_instagram_patente_unique") {
      return { estado: "error", error: MSG_PATENTE_USADA };
    }
    throw error;
  }
}
