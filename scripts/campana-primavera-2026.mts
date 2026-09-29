// Campaña de primavera por WhatsApp (sep-2026). Dos grupos, cada uno con su
// template MARKETING y un cupón de un uso SOLO WEB (rebaja el plan pagado con
// tarjeta, online o con el QR del mesón; no sirve para un lavado suelto):
//   A: sin plan, 2+ pasadas, activos en 90 días, sin contar a los que recibieron
//      el rellamado de agosto y no volvieron -> $3.000, template primavera_pasate_al_plan
//   B: vencidos hace más de 10 días -> $2.000, template primavera_reactiva_tu_plan
// Se excluye a los del experimento "Vuelve a 19.990" del 27-sep (su control no
// se puede contaminar), a Oneclick/Woo activos y a teléfonos que comparte un
// cliente vigente. Un teléfono = un mensaje.
//
// Control: patentes que terminan en 0 NO reciben mensaje. Quedan guardadas
// junto a los tratados (id + patente, sin teléfono) en scripts/campana-primavera-2026-<grupo>.json para
// medir el ~10-oct (tratados vs control).
//
// Precio del mensaje ({{3}}): mensual automático (19.990) menos el cupón. Es el
// techo: la web puede mostrar menos si al cliente le calza una promo, nunca más.
//
// Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/campana-primavera-2026.mts A|B [--enviar]
// Sin --enviar solo muestra conteos y un ejemplo; no escribe nada.
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { enviarMensajesMasivosWhatsapp } from "@/lib/whatsapp/masivo";
import { construirVariables } from "@/lib/whatsapp/reglas/motor";

const GRUPOS = {
  A: { plantillaId: "wa-primavera-2026-plan", nombre: "Primavera 2026 - Pásate al plan", meta: "primavera_pasate_al_plan", cupon: 3000,
       filtro: "seg='sin_plan' and pasadas>=2 and rec in ('1_<30','2_30-90') and ago<>'ago_no_volvio'" },
  B: { plantillaId: "wa-primavera-2026-reactiva", nombre: "Primavera 2026 - Reactiva tu plan", meta: "primavera_reactiva_tu_plan", cupon: 2000,
       filtro: "seg='vencido' and dias_venc>10 and not exp_sep" },
} as const;
const PRECIO_BASE = 19990;
const VALIDEZ_DIAS = 10;

const clave = process.argv[2] as keyof typeof GRUPOS;
const grupo = GRUPOS[clave];
if (!grupo) { console.error("Indica el grupo: A o B"); process.exit(1); }
const enviar = process.argv.includes("--enviar");

const SEGMENTOS = `
with hoy as (select (now() at time zone 'America/Santiago')::date d),
ult_ing as (select cliente_id, max(fecha) f, count(*) n from ingresos where cliente_id is not null group by 1),
ult_ven as (select cliente_id, max(fecha) f from ventas where cliente_id is not null and coalesce(es_servicio_adicional,false)=false group by 1),
ago as (
  select distinct cv.cliente_id from mensajes_whatsapp m join conversaciones_whatsapp cv on cv.id=m.conversacion_id
  where m.texto like '%rellamado_con_descuento_clientes_sin_plan%' and m.estado in ('entregado','leido')
),
agotel as (
  select distinct regexp_replace(cv.telefono,'[^0-9]','','g') tel from mensajes_whatsapp m join conversaciones_whatsapp cv on cv.id=m.conversacion_id
  where m.texto like '%rellamado_con_descuento_clientes_sin_plan%' and m.estado in ('entregado','leido')
),
base as (
  select c.id, c.patente, regexp_replace(c.telefono,'[^0-9]','','g') tel, c.vencimiento, c.creado_en, c.origen,
    case when c.vencimiento is null then 'sin_plan' when (c.vencimiento at time zone 'America/Santiago')::date < (select d from hoy) then 'vencido' else 'vigente' end seg,
    greatest(ui.f, uv.f, c.ultima_visita) ult, coalesce(ui.n,0) pasadas,
    (select d from hoy) - (c.vencimiento at time zone 'America/Santiago')::date dias_venc,
    exists(select 1 from suscripciones_oneclick s where (s.cliente_id=c.id or s.patente=c.patente) and s.estado in ('activa','pausada_validacion_x5','pendiente','pendiente_solo_tarjeta')) oneclick,
    (c.renovacion_auto_woo_desde is not null and c.suscripcion_cancelada_en is null) woo,
    exists(select 1 from cupones k where k.patente_asignada=c.patente and k.tipo='descuento' and not k.usado and k.fecha_caducidad>now()) cupon_vivo,
    exists(select 1 from cupones k where k.patente_asignada=c.patente and k.nombre_lote='Vuelve a 19.990 - vencidos mesón sep 2026') lote_sep,
    (c.id in (select cliente_id from ago) or regexp_replace(c.telefono,'[^0-9]','','g') in (select tel from agotel)) recibio_ago,
    c.sin_comunicacion_auto
  from clientes c left join ult_ing ui on ui.cliente_id=c.id left join ult_ven uv on uv.cliente_id=c.id
),
elig as (
  select *, case when ult is null then 'nunca' when now()-ult < interval '30 days' then '1_<30' when now()-ult < interval '90 days' then '2_30-90' when now()-ult < interval '180 days' then '3_90-180' else '4_>180' end rec
  from base where seg in ('sin_plan','vencido') and tel ~ '^569[0-9]{8}$' and not coalesce(sin_comunicacion_auto,false) and not oneclick and not woo
)
, t0 as (select timestamptz '2026-08-08 13:37:53+00' t0),
ultplan as (select distinct on (cliente_id) cliente_id, creado_por from ventas where tipo in ('Plan nuevo','Renovación preferencial','Renovación atrasada','Reactivación promocional','Renovación Web (manual)','Plan nuevo (Web)','Renovación (Web)','Renovación anticipada (Web)','Reactivación promocional (Web)','Upgrade a Plan X5 (Web)','Renovación automática (Oneclick)','Renovación anticipada (Oneclick)','Reactivación promocional (Oneclick)','Upgrade a Plan X5 (Oneclick)','Renovación manual') and not coalesce(es_servicio_adicional,false) order by cliente_id, fecha desc),
f as (
  select e.*,
   coalesce(e.seg='vencido' and (e.vencimiento at time zone 'America/Santiago')::date between date '2026-08-28' and date '2026-09-23'
     and exists(select 1 from ultplan up where up.cliente_id=e.id and not (up.creado_por like 'Automático%' or up.creado_por like '%(Oneclick)%' or up.creado_por='Migración histórica WooCommerce')),false) exp_sep,
   exists(select 1 from ingresos i where i.cliente_id=e.id and i.fecha >= (select t0 from t0) and i.fecha < (select t0 from t0)+interval '24 days') volvio_ago,
   coalesce(e.tel in (select tel from base where seg='vigente' and tel is not null),false) tel_vig
  from elig e
),
g as (select *, case when recibio_ago and volvio_ago then 'ago_volvio' when recibio_ago then 'ago_no_volvio' else 'nuevo' end ago from f)
`;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const filas = await sql.unsafe<{ id: string; patente: string; tel: string }[]>(`${SEGMENTOS}
    select distinct on (tel) id, patente, tel from g
    where not tel_vig and ${grupo.filtro}
    order by tel, ult desc nulls last`);
  const control = filas.filter((f) => f.patente?.trim().endsWith("0"));
  const tratados = filas.filter((f) => !f.patente?.trim().endsWith("0"));
  console.log(`Grupo ${clave}: ${filas.length} teléfonos -> ${tratados.length} reciben, ${control.length} control`);
  console.log(`Mensaje: Plan a ${PRECIO_BASE - grupo.cupon} con cupón web de ${grupo.cupon}, válido ${VALIDEZ_DIAS} días`);

  // El template tiene que estar APPROVED en Meta: si no, la Graph API rechaza cada envío.
  const res = await fetch(`https://graph.facebook.com/v25.0/${process.env.META_WABA_ID}/message_templates?name=${grupo.meta}&fields=name,status`, {
    headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` },
  });
  const estado = (await res.json()).data?.find((t: { name: string }) => t.name === grupo.meta)?.status;
  console.log(`Template ${grupo.meta}: ${estado}`);
  // Mismo armado que enviarMensajesMasivosWhatsapp: si alguna sale vacía, Meta rechaza el envío (#131009).
  const [ejemplo] = await getClientesByIds([tratados[0].id]);
  const vars = construirVariables({ cliente: ejemplo, montoAPagar: PRECIO_BASE - grupo.cupon, diasValidez: VALIDEZ_DIAS });
  console.log("Ejemplo {{1..4}}:", [vars.nombre, vars.patente, vars.montoAPagar, vars.diasValidez]);
  if (!enviar) throw new Error("simulacro: no se escribió ni envió nada. Agregar --enviar");
  if (estado !== "APPROVED") throw new Error("Template no aprobado todavía, no se envía.");

  await sql`insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo, meta_nombre, meta_idioma, meta_variables, meta_aprobado)
    values (${grupo.plantillaId}, ${grupo.nombre}, 'Campañas', ${`Template Meta ${grupo.meta}: {{nombre}} {{patente}} {{montoAPagar}} {{diasValidez}}`}, true,
            ${grupo.meta}, 'es_CL', ${sql.json(["nombre", "patente", "montoapagar", "diasvalidez"])}, true)
    on conflict (id) do nothing`;

  const enviadoEn = new Date().toISOString();
  writeFileSync(`scripts/campana-primavera-2026-${clave}.json`, JSON.stringify({ enviadoEn, grupo: clave, tratados: tratados.map(({ id, patente }) => ({ id, patente })), control: control.map(({ id, patente }) => ({ id, patente })) }, null, 2));

  const r = await enviarMensajesMasivosWhatsapp({
    plantillaId: grupo.plantillaId,
    clienteIds: tratados.map((t) => t.id),
    accion: "cupon_descuento",
    cuponValor: grupo.cupon,
    cuponEsPorcentaje: false,
    cuponValidezDias: VALIDEZ_DIAS,
    precioBase: PRECIO_BASE,
    enviadoPor: `campana-primavera-2026-${clave}`,
  });
  // enviarMensajesMasivosWhatsapp crea los cupones con canal "ambos" (default de
  // la tabla); acá se dejan solo web para que no rebajen un lavado en el mesón.
  const web = await sql`update cupones set canal = 'web' where nombre_lote = ${`WhatsApp masivo - ${grupo.nombre}`} and canal <> 'web' returning id`;
  console.log(r, `\n${web.length} cupones pasados a solo web`);
} catch (e) {
  console.log(`\n${(e as Error).message}`);
} finally {
  await sql.end();
  // getDb() (usado por enviarMensajesMasivosWhatsapp) deja su propio pool abierto.
  process.exit();
}
