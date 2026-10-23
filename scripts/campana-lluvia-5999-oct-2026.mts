// Campaña "Pasó la lluvia, lava por $5.999" (21-oct-2026), por SMS y correo: a
// los clientes que compraron un Lavado único (mesón o web) entre el 11 y el
// 21-oct, un código de descuento para el Lavado Full Túnel ($9.990 → $5.999),
// válido hasta el 3-nov-2026.
//
// A diferencia de vuelve-6990, el descuento NO va atado a la patente y sirve
// para dos autos (el del cliente y el de un amigo que invite). Por eso cada
// cliente recibe DOS códigos abiertos (patente_asignada null, mismo esquema
// que el código de referido de cupon_regalo), cada uno de un solo uso: un
// único código con un_uso_por_patente no tiene tope de patentes y podría
// circular sin límite. El mensaje los lleva escritos: en el mesón se digitan,
// no aparecen al buscar la patente. Canal 'local' (mesón).
//
// Fuera: plan vigente, sin_comunicacion_auto, y quienes ya hicieron el
// "Upgrade a Promo 4 Lavados" desde el 11-oct (tienen tickets pagados). Sin
// grupo de control (decisión del usuario): se mide solo por códigos usados.
//
// SMS: un celular = un SMS, con la patente que vino más recientemente. Correo:
// un email = un correo, mismo criterio. Un cliente puede recibir los dos, con
// los MISMOS códigos. El correo masivo (enviarCorreosMasivos) no sabe de códigos
// por cliente, así que acá se arma con las mismas piezas que usa él.
//
// Reanudable: la lista y los códigos se congelan en el JSON y en la base al
// primer --enviar; el SMS no repite a quien ya lo recibió (campaña) y el
// correo no repite (disparo con origenId fijo por cliente).
//
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-lluvia-5999-oct-2026.mts
//     Simulacro: conteos, textos y largo; no escribe ni envía nada.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-lluvia-5999-oct-2026.mts --enviar
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { obtenerOCrearReglaEnvioManual, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { clienteIdsConSmsDeCampana } from "@/lib/dataAccess/sms";
import { randomUUID } from "node:crypto";
import { ejecutarAccionReglaCorreo } from "@/lib/mailing/reglas/motor";
import { enviarSms } from "@/lib/sms/enviar";
import { normalizarSms, segmentosSms } from "@/lib/sms/texto";
import { construirVariables, generarCodigosCuponUnicos } from "@/lib/whatsapp/reglas/motor";

const CAMPANA = "lluvia-5999-oct-2026";
const ARCHIVO = `scripts/campana-${CAMPANA}.json`;
const LOTE = `Campaña ${CAMPANA}`;
const PRECIO_LAVADO = 9990;
const PRECIO_PROMO = 5999;
// 3-nov 23:59 Chile (horario de verano, UTC-3).
const CADUCA = "2026-11-03T23:59:59-03:00";
const TEXTO_SMS = "Zplash: Paso la lluvia! Lava a $5.999 (normal $9.990) con el codigo {{codigo}} e invita a un amigo con {{codigoAmigo}}. Hasta el 03/11.";
const PLANTILLA_CORREO = {
  id: "correo-campana-lluvia-5999-oct-2026",
  nombre: "Campaña Pasó la lluvia $5.999 (oct-2026)",
  asunto: "{{nombre}}, pasó la lluvia: lava por $5.999 e invita a un amigo",
  cuerpo:
    "Hola {{nombre}},\n\nPasó la lluvia y es buen momento para dejar el auto impecable. Te regalamos un descuento: **lava por $5.999** (precio normal $9.990).\n\nTu código: **{{codigoCupon}}**\n\nY para que invites a un amigo, otro código igual: **{{codigoAmigo}}**\n\nCada código sirve para **un lavado** en **cualquier vehículo**. Solo hay que decirlo en caja al llegar al local.\n\nVálidos hasta el **3 de noviembre**.\n\n¡Los esperamos en el túnel!",
};

type Fila = { id: string; patente: string; codigo: string; codigoAmigo: string; sms: boolean; correo: boolean };
const textoSms = (f: Pick<Fila, "codigo" | "codigoAmigo">) => TEXTO_SMS.replace("{{codigo}}", f.codigo).replace("{{codigoAmigo}}", f.codigoAmigo);

const enviar = process.argv.includes("--enviar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  let filas: Fila[];
  if (existsSync(ARCHIVO)) {
    filas = JSON.parse(readFileSync(ARCHIVO, "utf8")).filas;
    console.log(`Usando la lista guardada en ${ARCHIVO}`);
  } else {
    const crudas = await sql<{ id: string; patente: string; tel: string; email: string }[]>`
      with hoy as (select (now() at time zone 'America/Santiago')::date d),
      v as (
        select coalesce(v.cliente_id, c2.id) cid
        from ventas v left join clientes c2 on v.cliente_id is null and upper(c2.patente) = upper(v.patente)
        where v.tipo in ('Lavado único', 'Lavado único (Web)')
          and (v.fecha at time zone 'America/Santiago')::date between '2026-10-11' and '2026-10-21'
      ),
      ult as (
        select coalesce(i.cliente_id, c3.id) cid, max(i.fecha) f from ingresos i
        left join clientes c3 on i.cliente_id is null and upper(c3.patente) = upper(i.patente)
        group by 1
      )
      select c.id, c.patente,
        regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') tel,
        lower(trim(coalesce(c.email, ''))) email
      from clientes c left join ult u on u.cid = c.id
      where c.id in (select cid from v)
        and not coalesce(c.sin_comunicacion_auto, false) and c.patente !~ '^SIN-PATENTE'
        and not (c.vencimiento is not null and (c.vencimiento at time zone 'America/Santiago')::date >= (select d from hoy))
        and not exists (
          select 1 from ventas u where (u.cliente_id = c.id or upper(u.patente) = upper(c.patente))
            and u.tipo like 'Upgrade a Promo%' and (u.fecha at time zone 'America/Santiago')::date >= '2026-10-11'
        )
      order by u.f desc nulls last`;
    const telVisto = new Set<string>();
    const emailVisto = new Set<string>();
    const elegidas = crudas.flatMap(({ tel, email, ...c }) => {
      const sms = /^569\d{8}$/.test(tel) && !telVisto.has(tel);
      const correo = email.includes("@") && !emailVisto.has(email);
      if (sms) telVisto.add(tel);
      if (correo) emailVisto.add(email);
      return sms || correo ? [{ ...c, sms, correo }] : [];
    });
    // En el simulacro los códigos son de muestra: se generan de verdad (únicos
    // contra la base) recién al enviar.
    const codigos = enviar ? await generarCodigosCuponUnicos(elegidas.length * 2) : elegidas.flatMap(() => ["XXXXXX", "YYYYYY"]);
    filas = elegidas.map((f, i) => ({ ...f, codigo: codigos[2 * i], codigoAmigo: codigos[2 * i + 1] }));
  }

  console.log({ clientes: filas.length, codigos: filas.length * 2, sms: filas.filter((f) => f.sms).length, correo: filas.filter((f) => f.correo).length });
  // Sin el pie de baja: decisión explícita del usuario para esta campaña.
  const ejemplo = normalizarSms(textoSms({ codigo: "ABC123", codigoAmigo: "DEF456" }));
  console.log(`SMS (${ejemplo.length} car., ${segmentosSms(ejemplo)} SMS): ${ejemplo}`);
  console.log(`Correo: ${PLANTILLA_CORREO.asunto}\n${PLANTILLA_CORREO.cuerpo}`);
  if (segmentosSms(ejemplo) > 1) throw new Error("El texto pasa de 1 SMS, acortarlo antes de enviar.");
  if (!enviar) throw new Error("simulacro: no se escribió ni envió nada. Agregar --enviar");

  if (!existsSync(ARCHIVO)) writeFileSync(ARCHIVO, JSON.stringify({ enviadoEn: new Date().toISOString(), filas }, null, 2));

  // 1. Códigos (antes de cualquier mensaje: el mensaje los promete). Abiertos,
  // un solo uso global cada uno, canal mesón.
  const ahora = new Date().toISOString();
  const cupones = filas.flatMap((f) => [
    { id: `lluvia5999-${f.id}`, codigo: f.codigo },
    { id: `lluvia5999-${f.id}-amigo`, codigo: f.codigoAmigo },
  ]);
  for (let i = 0; i < cupones.length; i += 200) {
    const tanda = cupones.slice(i, i + 200);
    await sql`insert into cupones ${sql(
      tanda.map((f) => ({
        id: f.id,
        codigo: f.codigo,
        nombre_lote: LOTE,
        valor: PRECIO_LAVADO - PRECIO_PROMO,
        numero_lote: 1,
        total_lote: 1,
        fecha_caducidad: new Date(CADUCA),
        usado: false,
        creado_en: new Date(ahora),
        creado_por: `campana-${CAMPANA}`,
        tipo: "descuento",
        es_porcentaje: false,
        canal: "local",
      }))
    )} on conflict (id) do nothing`;
  }
  const [{ n }] = await sql`select count(*)::int n from cupones where nombre_lote = ${LOTE}`;
  if (n < cupones.length) throw new Error(`Solo hay ${n} de ${cupones.length} códigos en la base: no se envía nada`);
  console.log(`${n} códigos en el lote "${LOTE}"`);

  // 2. SMS.
  const clientes = new Map((await getClientesByIds(filas.map((f) => f.id))).map((c) => [c.id, c]));
  const filasSms = filas.filter((f) => f.sms);
  const yaSms = new Set(await clienteIdsConSmsDeCampana(CAMPANA, filasSms.map((f) => f.id)));
  const rSms = { enviados: 0, fallidos: 0, repetidos: 0, primerError: undefined as string | undefined };
  for (const f of filasSms) {
    const c = clientes.get(f.id);
    if (!c?.telefono || c.sinComunicacionAuto) continue;
    if (yaSms.has(f.id)) {
      rSms.repetidos++;
      continue;
    }
    const r = await enviarSms({ telefono: c.telefono, texto: textoSms(f), sinPieBaja: true, campana: CAMPANA, clienteId: f.id, enviadoPor: `campana-${CAMPANA}` }).catch(
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
  await sql`insert into plantillas_correo (id, nombre, categoria, asunto, cuerpo, activo)
    values (${PLANTILLA_CORREO.id}, ${PLANTILLA_CORREO.nombre}, 'Campañas', ${PLANTILLA_CORREO.asunto}, ${PLANTILLA_CORREO.cuerpo}, true)
    on conflict (id) do nothing`;
  const regla = await obtenerOCrearReglaEnvioManual(PLANTILLA_CORREO.id, `campana-${CAMPANA}`);
  if (!regla) throw new Error("No se pudo crear la regla percha del correo");
  const rCorreo = { enviados: 0, fallidos: 0, omitidos: 0 };
  for (const f of filas.filter((f) => f.correo)) {
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
    const variables = { ...construirVariables({ cliente: c, cupon: { codigo: f.codigo, fechaCaducidad: CADUCA } }), codigoAmigo: f.codigoAmigo };
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
