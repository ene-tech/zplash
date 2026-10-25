// Invitación a la Promo 5 Tickets VIP (25-oct-2026), por SMS y correo: a los
// que terminaron su pack de 4 antes de que existiera la VIP (a ellos no les
// llegó el aviso de "ultimo_ticket_pack"). El mesón se la ofrece hasta
// clientes.invitacion_vip_hasta, que se graba por SQL ANTES de correr esto:
// sin eso el mensaje promete algo que el mesón no muestra, y el script corta.
//
// Fuera: STPW85, que pagó la Promo 4 Lavados el 15-oct y le faltan 3 tickets
// (no terminó su pack, se le devuelven aparte).
//
// SMS: un celular = un SMS con todas sus patentes (TAS VIP tiene dos con el
// mismo número). Correo: uno por cliente. Reanudable: el SMS no repite a quien
// ya lo recibió (campaña) y el correo no repite (disparo con origenId fijo).
//
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/invitacion-vip-oct-2026.mts
//     Simulacro: destinatarios, textos y largo; no envía nada.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/invitacion-vip-oct-2026.mts --enviar
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { obtenerOCrearReglaEnvioManual, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { clienteIdsConSmsDeCampana } from "@/lib/dataAccess/sms";
import { ejecutarAccionReglaCorreo } from "@/lib/mailing/reglas/motor";
import { enviarSms } from "@/lib/sms/enviar";
import { normalizarSms, segmentosSms } from "@/lib/sms/texto";
import { construirVariables } from "@/lib/whatsapp/reglas/motor";

const CAMPANA = "invitacion-vip-oct-2026";
const PATENTES = ["RCBZ19", "VRPK34", "RWXT63", "SYLX63", "TVRX55"];

const PLANTILLA_CORREO = {
  id: "correo-campana-invitacion-vip-oct-2026",
  nombre: "Invitación Promo 5 Tickets VIP (oct-2026)",
  asunto: "{{nombre}}, una promo especial por terminar tu pack",
  cuerpo:
    "Hola {{nombre}},\n\nGracias por usar todos los lavados de tu pack en ZPlash. Por ser cliente frecuente te invitamos a la **Promo 5 Tickets VIP**: por **$19.990** te llevas **4 lavados** para tu auto **{{patente}}** y **1 lavado libre** que puedes usar en tu auto o regalarle a quien quieras.\n\nLos 5 lavados duran 30 días. La promo se paga solo en el mesón: di tu patente al llegar.\n\nVálida hasta el **{{fechaLimite}}**.\n\n¡Te esperamos en el túnel!",
};

const fmtLimite = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit" });
const textoSms = (patentes: string[], limite: string) =>
  `ZPlash: terminaste tu pack! Promo 5 Tickets VIP $19.990: 4 lavados para ${patentes.join(" y ")} + 1 libre para cualquier auto. Solo en el meson, hasta el ${limite}.`;

const enviar = process.argv.includes("--enviar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const filas = await sql<{ id: string; patente: string; tel: string; email: string; hasta: Date | null }[]>`
    select id, patente, regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g') tel,
      lower(trim(coalesce(email, ''))) email, invitacion_vip_hasta hasta
    from clientes where patente in ${sql(PATENTES)} and not coalesce(sin_comunicacion_auto, false)`;
  const sinInvitacion = filas.filter((f) => !f.hasta || f.hasta <= new Date());
  if (filas.length !== PATENTES.length) console.log(`Ojo: ${PATENTES.length - filas.length} patente(s) quedan fuera (sin ficha o sin comunicación)`);
  if (sinInvitacion.length) throw new Error(`Falta pegar el SQL de invitacion_vip_hasta para: ${sinInvitacion.map((f) => f.patente).join(", ")}`);
  const limite = fmtLimite(filas[0].hasta!.toISOString());

  const porTel = new Map<string, (typeof filas)[number][]>();
  for (const f of filas) if (/^569\d{8}$/.test(f.tel)) porTel.set(f.tel, [...(porTel.get(f.tel) ?? []), f]);
  console.log({ clientes: filas.length, sms: porTel.size, correo: filas.filter((f) => f.email.includes("@")).length, limite });
  for (const grupo of porTel.values()) {
    const t = normalizarSms(textoSms(grupo.map((f) => f.patente), limite));
    console.log(`SMS (${t.length} car., ${segmentosSms(t)} SMS): ${t}`);
    if (segmentosSms(t) > 1) throw new Error("El texto pasa de 1 SMS, acortarlo antes de enviar.");
  }
  console.log(`Correo: ${PLANTILLA_CORREO.asunto}\n${PLANTILLA_CORREO.cuerpo}`);
  if (!enviar) throw new Error("simulacro: no se envió nada. Agregar --enviar");

  const clientes = new Map((await getClientesByIds(filas.map((f) => f.id))).map((c) => [c.id, c]));
  const ya = new Set(await clienteIdsConSmsDeCampana(CAMPANA, filas.map((f) => f.id)));
  const rSms = { enviados: 0, fallidos: 0, repetidos: 0, primerError: undefined as string | undefined };
  for (const grupo of porTel.values()) {
    const c = clientes.get(grupo[0].id);
    if (!c?.telefono) continue;
    if (grupo.some((f) => ya.has(f.id))) {
      rSms.repetidos++;
      continue;
    }
    const r = await enviarSms({
      telefono: c.telefono,
      texto: textoSms(grupo.map((f) => f.patente), limite),
      campana: CAMPANA,
      clienteId: c.id,
      enviadoPor: `campana-${CAMPANA}`,
    }).catch((e) => ({ ok: false, error: String(e) }));
    if (r.ok) rSms.enviados++;
    else {
      rSms.fallidos++;
      rSms.primerError ??= r.error;
    }
  }
  console.log("sms", rSms);

  await sql`insert into plantillas_correo (id, nombre, categoria, asunto, cuerpo, activo)
    values (${PLANTILLA_CORREO.id}, ${PLANTILLA_CORREO.nombre}, 'Campañas', ${PLANTILLA_CORREO.asunto}, ${PLANTILLA_CORREO.cuerpo}, true)
    on conflict (id) do nothing`;
  const regla = await obtenerOCrearReglaEnvioManual(PLANTILLA_CORREO.id, `campana-${CAMPANA}`);
  if (!regla) throw new Error("No se pudo crear la regla percha del correo");
  const rCorreo = { enviados: 0, fallidos: 0, omitidos: 0 };
  for (const f of filas.filter((f) => f.email.includes("@"))) {
    const c = clientes.get(f.id);
    if (!c?.email) continue;
    const disparo = await registrarDisparoReglaCorreo({
      id: randomUUID(),
      reglaId: regla.id,
      origenTipo: "cliente",
      origenId: `${f.id}:${CAMPANA}`,
      clienteId: f.id,
      patente: c.patente,
      estado: "programado",
      enviarEn: new Date().toISOString(),
    });
    if (!disparo) {
      rCorreo.omitidos++;
      continue;
    }
    const variables = { ...construirVariables({ cliente: c }), fechaLimite: limite };
    const ok = await ejecutarAccionReglaCorreo(regla, disparo.id, c, variables).catch(() => false);
    if (ok) rCorreo.enviados++;
    else rCorreo.fallidos++;
  }
  console.log("correo", rCorreo);
} catch (e) {
  console.log(`\n${(e as Error).message}`);
} finally {
  await sql.end();
  process.exit();
}
