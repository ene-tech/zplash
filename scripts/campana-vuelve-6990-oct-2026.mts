// Campaña "Vuelve por $6.990" (oct-2026), por SMS y correo: a los clientes que
// no pasan por el túnel hace 10 días o más (según la última fila de
// `ingresos`), un descuento de $3.000 cargado a su patente para el Lavado Full
// Túnel ($9.990 → $6.990), válido hasta el 31-oct-2026.
//
// El objetivo es medir qué tramo de inactividad responde mejor, así que cada
// tramo sale como campaña SMS aparte (mensajes_sms.campana y su propio lote de
// cupones "SMS masivo - vuelve-6990-oct-2026-dXX"), y cada tramo tiene un
// grupo de CONTROL (patentes que terminan en 0) que no recibe nada por ningún
// canal: sin él, el tramo más reciente siempre parece el mejor porque vuelve
// solo. La lista (tramo, estado de plan, control, si se le mandó SMS y/o
// correo) queda en scripts/campana-vuelve-6990-oct-2026.json, para medir
// después del 31-oct el retorno (ingresos desde el envío) de tratados contra
// control en cada tramo.
//
// Fuera: plan vigente (lavan sin pagar) y sin_comunicacion_auto (lo filtran
// también los dos envíos). SMS: un celular = un SMS, con la patente de ese
// teléfono que vino más recientemente. Correo: un email = un correo, mismo
// criterio. Un cliente puede recibir los dos.
//
// Un cupón por patente, compartido por los dos canales: lo crea el envío SMS y
// a quien solo recibe correo se le crea en el mismo lote de su tramo. Es canal
// 'local' (mesón, que lo muestra solo al buscar la patente): en 'ambos'
// también rebajaría un plan pagado por la web. Su vencimiento se fija al
// 31-oct 23:59 Chile al final (los envíos solo saben de "días de validez").
//
// Reanudable: el SMS no repite a quien ya recibió la campaña y reusa el cupón
// vigente del lote; el correo no repite en el mismo día (ver
// enviarCorreosMasivos); la lista se congela en el JSON al primer envío.
//
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-vuelve-6990-oct-2026.mts
//     Simulacro: conteos por tramo, textos y largo; no escribe ni envía nada.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-vuelve-6990-oct-2026.mts --enviar
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { cuponesVigentesDeLote } from "@/lib/dataAccess/cupones";
import { enviarCorreosMasivos } from "@/lib/mailing/masivo";
import { enviarMensajesMasivosSms } from "@/lib/sms/masivo";
import { segmentosSms, textoFinalSms } from "@/lib/sms/texto";
import { generarCuponesMasivos, type OpcionesOfertaMasivo } from "@/lib/whatsapp/masivo";

const CAMPANA = "vuelve-6990-oct-2026";
const ARCHIVO = `scripts/campana-${CAMPANA}.json`;
const PRECIO_LAVADO = 9990;
const PRECIO_PROMO = 6990;
// 31-oct 23:59 Chile (horario de verano, UTC-3). En ISO: postgres.js pasa el
// parámetro por new Date(), que no entiende "America/Santiago".
const CADUCA = "2026-10-31T23:59:59-03:00";
const TEXTO_SMS = `Zplash: Te extrañamos! Lava tu auto por $6.990 (normal $9.990) hasta el 31/10. Descuento ya cargado a tu patente {{patente}}.`;
const PLANTILLA_CORREO = {
  id: "correo-campana-vuelve-6990-oct-2026",
  nombre: "Campaña Vuelve por $6.990 (oct-2026)",
  asunto: "{{nombre}}, lava tu auto por $6.990 hasta el 31 de octubre",
  cuerpo:
    "Hola {{nombre}},\n\nHace un tiempo que no te vemos por ZPlash, así que te dejamos un descuento: **lava tu auto por $6.990** (precio normal $9.990).\n\nEl descuento ya está cargado a tu patente **{{patente}}**. Solo ven al local y dila en caja, no necesitas código.\n\nVálido hasta el **31 de octubre**.\n\n¡Te esperamos en el túnel!",
};
const OFERTA: OpcionesOfertaMasivo = {
  accion: "cupon_descuento",
  cuponValor: PRECIO_LAVADO - PRECIO_PROMO,
  cuponEsPorcentaje: false,
  cuponValidezDias: 15,
  precioBase: PRECIO_LAVADO,
};
const TRAMOS = [
  { id: "d10a19", desde: 10, hasta: 19 },
  { id: "d20a29", desde: 20, hasta: 29 },
  { id: "d30a59", desde: 30, hasta: 59 },
  { id: "d60a89", desde: 60, hasta: 89 },
  { id: "d90mas", desde: 90, hasta: Infinity },
];
const tramoDe = (dias: number) => TRAMOS.find((t) => dias >= t.desde && dias <= t.hasta)!.id;
const loteDe = (tramo: string) => `SMS masivo - ${CAMPANA}-${tramo}`;

type Fila = {
  id: string;
  patente: string;
  dias: number;
  estado: "sin_plan" | "vencido";
  tramo: string;
  control: boolean;
  sms: boolean;
  correo: boolean;
};

const enviar = process.argv.includes("--enviar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  // Si ya se envió una vez, se reusa la misma lista: recalcular cambiaría los
  // tramos (los días avanzan) y metería a gente nueva en la medición.
  let filas: Fila[];
  if (existsSync(ARCHIVO)) {
    filas = JSON.parse(readFileSync(ARCHIVO, "utf8")).filas;
    console.log(`Usando la lista guardada en ${ARCHIVO}`);
  } else {
    const crudas = await sql<(Omit<Fila, "tramo" | "control"> & { tel: string; email: string; f: Date })[]>`
      with ing as (
        select coalesce(i.cliente_id, c2.id) cid, i.fecha from ingresos i
        left join clientes c2 on i.cliente_id is null and upper(c2.patente) = upper(i.patente)
      ),
      ult as (select cid, max(fecha) f from ing where cid is not null group by 1),
      hoy as (select (now() at time zone 'America/Santiago')::date d)
      select c.id, c.patente, u.f,
        regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') tel,
        lower(trim(coalesce(c.email, ''))) email,
        (select d from hoy) - (u.f at time zone 'America/Santiago')::date dias,
        case when c.vencimiento is null then 'sin_plan' else 'vencido' end estado
      from clientes c join ult u on u.cid = c.id
      where not coalesce(c.sin_comunicacion_auto, false) and c.patente !~ '^SIN-PATENTE'
        and not (c.vencimiento is not null and (c.vencimiento at time zone 'America/Santiago')::date >= (select d from hoy))
        and (select d from hoy) - (u.f at time zone 'America/Santiago')::date >= 10
      order by u.f desc`;
    // Ordenadas por última pasada, la primera de cada teléfono/email es la
    // patente que vino más recientemente.
    const telVisto = new Set<string>();
    const emailVisto = new Set<string>();
    filas = crudas.flatMap(({ tel, email, f: _f, ...c }) => {
      const telOk = /^569\d{8}$/.test(tel);
      const emailOk = email.includes("@");
      // Sin teléfono ni email no entra a la medición, tampoco como control:
      // el control tiene que ser gente a la que se le PODRÍA haber escrito.
      if (!telOk && !emailOk) return [];
      const control = c.patente.endsWith("0");
      const sms = !control && telOk && !telVisto.has(tel);
      const correo = !control && emailOk && !emailVisto.has(email);
      if (sms) telVisto.add(tel);
      if (correo) emailVisto.add(email);
      if (!control && !sms && !correo) return [];
      return [{ ...c, tramo: tramoDe(c.dias), control, sms, correo }];
    });
  }

  console.table(
    TRAMOS.map((t) => {
      const delTramo = filas.filter((f) => f.tramo === t.id);
      const tratados = delTramo.filter((f) => !f.control);
      return {
        tramo: t.id,
        tratados: tratados.length,
        sms: tratados.filter((f) => f.sms).length,
        correo: tratados.filter((f) => f.correo).length,
        control: delTramo.filter((f) => f.control).length,
      };
    })
  );
  const ejemplo = textoFinalSms(TEXTO_SMS.replace("{{patente}}", filas[0]?.patente ?? "ABCD12"), "XXXXXX");
  console.log(`SMS (${ejemplo.length} car., ${segmentosSms(ejemplo)} SMS): ${ejemplo}`);
  console.log(`Correo: ${PLANTILLA_CORREO.asunto}\n${PLANTILLA_CORREO.cuerpo}`);
  if (segmentosSms(ejemplo) > 1) throw new Error("El texto pasa de 1 SMS, acortarlo antes de enviar.");
  if (!enviar) throw new Error("simulacro: no se escribió ni envió nada. Agregar --enviar");

  if (!existsSync(ARCHIVO)) writeFileSync(ARCHIVO, JSON.stringify({ enviadoEn: new Date().toISOString(), filas }, null, 2));

  // 1. SMS por tramo (crea los cupones de sus patentes).
  for (const t of TRAMOS) {
    const campana = `${CAMPANA}-${t.id}`;
    const ids = filas.filter((f) => f.tramo === t.id && f.sms).map((f) => f.id);
    const r = await enviarMensajesMasivosSms({ campana, texto: TEXTO_SMS, clienteIds: ids, enviadoPor: `campana-${CAMPANA}`, ...OFERTA });
    console.log(campana, r);
  }

  // 2. Cupón para quien solo recibe correo, en el lote de su tramo.
  for (const t of TRAMOS) {
    const delTramo = filas.filter((f) => f.tramo === t.id && f.correo);
    const conCupon = new Set((await cuponesVigentesDeLote(loteDe(t.id), delTramo.map((f) => f.patente))).map((c) => c.patenteAsignada));
    const faltan = delTramo.filter((f) => !conCupon.has(f.patente));
    if (!faltan.length) continue;
    const creados = await generarCuponesMasivos(await getClientesByIds(faltan.map((f) => f.id)), OFERTA, loteDe(t.id), `campana-${CAMPANA}`);
    if (!creados) throw new Error(`No se pudieron crear los cupones de correo del tramo ${t.id}: no se manda el correo`);
    console.log(`${t.id}: ${creados.size} cupones nuevos para quienes solo reciben correo`);
  }
  const ajustados = await sql`update cupones set fecha_caducidad = ${CADUCA}::timestamptz, canal = 'local'
    where nombre_lote like ${`SMS masivo - ${CAMPANA}-%`} and not usado`;
  console.log(`${ajustados.count} cupones con canal local y vencimiento ${CADUCA}`);

  // 3. Correo (después de los cupones: promete un descuento ya cargado).
  await sql`insert into plantillas_correo (id, nombre, categoria, asunto, cuerpo, activo)
    values (${PLANTILLA_CORREO.id}, ${PLANTILLA_CORREO.nombre}, 'Campañas', ${PLANTILLA_CORREO.asunto}, ${PLANTILLA_CORREO.cuerpo}, true)
    on conflict (id) do nothing`;
  const r = await enviarCorreosMasivos({
    plantillaCorreoId: PLANTILLA_CORREO.id,
    clienteIds: filas.filter((f) => f.correo).map((f) => f.id),
    enviadoPor: `campana-${CAMPANA}`,
  });
  console.log("correo", r);
} catch (e) {
  console.log(`\n${(e as Error).message}`);
} finally {
  await sql.end();
  process.exit();
}
