// "Actualizamos tu Plan X5" (25-oct-2026), por SMS y correo: a todos los
// clientes con Plan X5 vigente (el Ilimitado viejo no), UN lavado Full Túnel
// de regalo para cualquier vehículo, válido un mes (hasta el 25-nov). Es un
// regalo único, no mensual: la renovación del plan no emite otro (decisión del
// usuario).
//
// El ticket es un cupón "vale" abierto, igual que el de la Promo Reactivación
// Web (ver src/lib/pagos/ticketReactivacion.ts): valor 0 (cortesía), sin
// patentesAutorizadas (lo canjea cualquier patente), con el correo de la
// ficha para que aparezca en "Mis tickets y cupones" de Mi Cuenta.
//
// Incluye a quienes tienen sin_comunicacion_auto y el SMS va sin pie de baja:
// es un cambio de su plan, no publicidad (decisión del usuario). Un mensaje por
// cliente (por plan), no por teléfono: dos autos con plan son dos regalos.
//
// Reanudable: la lista y los códigos se congelan en el JSON al primer --enviar;
// el SMS no repite (campaña) y el correo se marca en el JSON tras enviarse.
//
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-lavado-regalo-plan-oct-2026.mts
//     Simulacro: conteos y textos; no escribe ni envía nada.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-lavado-regalo-plan-oct-2026.mts --enviar
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { clienteIdsConSmsDeCampana } from "@/lib/dataAccess/sms";
import { generarCodigoCupon } from "@/lib/helpers/cupones";
import { esEmailEnviable } from "@/lib/helpers/validadores";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { enviarSms } from "@/lib/sms/enviar";
import { normalizarSms, segmentosSms } from "@/lib/sms/texto";

const CAMPANA = "lavado-regalo-plan-oct-2026";
const ARCHIVO = `scripts/campana-${CAMPANA}.json`;
const LOTE = "Lavado de regalo Plan X5";
// 25-nov 23:59 Chile (horario de verano, UTC-3).
const CADUCA = "2026-11-25T23:59:59-03:00";
const TEXTO_SMS = "Zplash: Actualizamos tu Plan X5! Te regalamos 1 lavado extra para cualquier auto con el codigo {{codigo}}, valido hasta el 25/11.";
const ASUNTO = "Actualizamos tu Plan X5: te regalamos un lavado extra";

type Fila = { id: string; nombre: string; patente: string; telefono: string; email: string; codigo: string; correoEnviado?: boolean };
const textoSms = (f: Pick<Fila, "codigo">) => TEXTO_SMS.replace("{{codigo}}", f.codigo);
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlCorreo = (f: Fila) =>
  envolverHtmlBase(`
    <p style="margin:0 0 20px;">Hola${f.nombre && f.nombre !== "Cliente Web" ? ` ${escapar(f.nombre)}` : ""}, actualizamos tu Plan X5: además de tus 5 lavados del mes, te regalamos <strong>1 lavado Full Túnel extra</strong> para <strong>cualquier vehículo</strong> —otro auto tuyo, o el de un amigo—.</p>
    <p style="margin:0 0 8px;">Tu lavado de regalo:</p>
    <p style="margin:0 0 20px; font-size:32px; font-weight:bold; letter-spacing:8px; color:#262320;">${f.codigo}</p>
    <p style="margin:0 0 20px;">Basta con mostrarlo en caja antes del <strong>25 de noviembre</strong>.</p>
    <p style="margin:0;">También lo tienes siempre a mano en &quot;Mis tickets y cupones&quot;, dentro de Mi Cuenta.</p>
  `);

const enviar = process.argv.includes("--enviar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  let filas: Fila[];
  if (existsSync(ARCHIVO)) {
    filas = JSON.parse(readFileSync(ARCHIVO, "utf8")).filas;
    console.log(`Usando la lista guardada en ${ARCHIVO}`);
  } else {
    // Vigente por la fecha UTC del vencimiento: buena parte de las fichas lo
    // guardan a medianoche UTC, que en Chile es la noche anterior al último día.
    const crudas = await sql<Omit<Fila, "codigo">[]>`
      select c.id, coalesce(c.nombre, '') nombre, c.patente, coalesce(c.telefono, '') telefono,
        lower(trim(coalesce(c.email, ''))) email
      from clientes c
      where c.plan = 'Plan X5' and c.vencimiento is not null
        and (c.vencimiento at time zone 'UTC')::date >= (now() at time zone 'America/Santiago')::date
        and c.patente !~ '^SIN-PATENTE'
      order by c.vencimiento`;
    filas = crudas.map((c) => ({ ...c, codigo: "" }));
  }

  const conSms = filas.filter((f) => /^569\d{8}$/.test(f.telefono.replace(/\D/g, "")));
  const conCorreo = filas.filter((f) => esEmailEnviable(f.email));
  console.log({ clientes: filas.length, sms: conSms.length, correo: conCorreo.length });
  const ejemplo = normalizarSms(textoSms({ codigo: "ABC123" }));
  console.log(`SMS (${ejemplo.length} car., ${segmentosSms(ejemplo)} SMS): ${ejemplo}`);
  console.log(`Correo: ${ASUNTO}`);
  if (segmentosSms(ejemplo) > 1) throw new Error("El texto pasa de 1 SMS, acortarlo antes de enviar.");
  if (!enviar) throw new Error("simulacro: no se escribió ni envió nada. Agregar --enviar");

  // 1. Tickets (antes de cualquier mensaje: el mensaje los promete). Id fijo
  // por cliente: un reintento no emite otro.
  const guardar = () => writeFileSync(ARCHIVO, JSON.stringify({ enviadoEn: new Date().toISOString(), filas }, null, 2));
  const usados = new Set((await sql<{ codigo: string }[]>`select codigo from cupones`).map((r) => r.codigo));
  for (const f of filas) {
    if (!f.codigo) {
      f.codigo = generarCodigoCupon(usados);
      usados.add(f.codigo);
    }
  }
  guardar();
  const ahora = new Date();
  for (let i = 0; i < filas.length; i += 200) {
    await sql`insert into cupones ${sql(
      filas.slice(i, i + 200).map((f) => ({
        id: `${CAMPANA}-${f.id}`,
        codigo: f.codigo,
        nombre_lote: LOTE,
        valor: 0,
        numero_lote: 1,
        total_lote: 1,
        fecha_caducidad: new Date(CADUCA),
        usado: false,
        creado_en: ahora,
        creado_por: `campana-${CAMPANA}`,
        tipo: "vale",
        patente_asignada: f.patente,
        email: f.email || null,
      }))
    )} on conflict (id) do nothing`;
  }
  const [{ n }] = await sql`select count(*)::int n from cupones where nombre_lote = ${LOTE}`;
  if (n < filas.length) throw new Error(`Solo hay ${n} de ${filas.length} tickets en la base: no se envía nada`);
  console.log(`${n} tickets en el lote "${LOTE}"`);

  // 2. SMS.
  const yaSms = new Set(await clienteIdsConSmsDeCampana(CAMPANA, conSms.map((f) => f.id)));
  const rSms = { enviados: 0, fallidos: 0, repetidos: 0, primerError: undefined as string | undefined };
  for (const f of conSms) {
    if (yaSms.has(f.id)) {
      rSms.repetidos++;
      continue;
    }
    const r = await enviarSms({ telefono: f.telefono, texto: textoSms(f), sinPieBaja: true, campana: CAMPANA, clienteId: f.id, enviadoPor: `campana-${CAMPANA}` }).catch(
      (e) => ({ ok: false, error: String(e) })
    );
    if (r.ok) rSms.enviados++;
    else {
      rSms.fallidos++;
      rSms.primerError ??= r.error;
    }
  }
  console.log("sms", rSms);

  // 3. Correo.
  const rCorreo = { enviados: 0, fallidos: 0, repetidos: 0 };
  for (const f of conCorreo) {
    if (f.correoEnviado) {
      rCorreo.repetidos++;
      continue;
    }
    const r = await enviarCorreoTransaccional({ to: f.email, subject: ASUNTO, html: htmlCorreo(f), clienteId: f.id }).catch(() => ({ ok: false }));
    if (r.ok) {
      rCorreo.enviados++;
      f.correoEnviado = true;
      guardar();
    } else rCorreo.fallidos++;
  }
  console.log("correo", rCorreo);
} catch (e) {
  console.log(`\n${(e as Error).message}`);
} finally {
  await sql.end();
  process.exit();
}
