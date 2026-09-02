// SOLO LECTURA. Embudo de WhatsApp: donde se cae la gente antes de comprar.
// Uso: npx tsx --env-file=.env.local scripts/diag-whatsapp.mts
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const p = (t: string, r: unknown) => console.log("\n### " + t + "\n" + JSON.stringify(r, null, 1));

p("Volumen por mes", await sql`
  select to_char(date_trunc('month', c.creado_en),'YYYY-MM') mes,
         count(*)::int conversaciones
  from conversaciones_whatsapp c group by 1 order by 1 desc limit 12`);

p("Conversaciones: total / con cliente / anonimas", await sql`
  select count(*)::int total,
         count(cliente_id)::int con_cliente,
         count(*) filter (where flow_state is not null)::int flujo_abandonado
  from conversaciones_whatsapp`);

p("Profundidad: msjs ENTRANTES por conversacion", await sql`
  with x as (select conversacion_id, count(*)::int n from mensajes_whatsapp
             where direccion='entrante' group by 1)
  select case when n=1 then '1 (rebote)' when n<=3 then '2-3' when n<=6 then '4-6'
              when n<=12 then '7-12' else '13+' end tramo,
         count(*)::int convs
  from x group by 1 order by 1`);

p("Top 40 textos entrantes (que escribe la gente de verdad)", await sql`
  select lower(btrim(texto)) t, count(*)::int n
  from mensajes_whatsapp where direccion='entrante'
  group by 1 order by n desc limit 40`);

// Clasificacion segun los sets del router (@/lib/whatsapp/router.ts)
p("Entrantes: reconocidos vs NO reconocidos por el bot", await sql`
  with m as (select lower(btrim(texto)) t from mensajes_whatsapp where direccion='entrante')
  select case
    when t ~ '^[a-z]{2}[0-9]{4}$' or t ~ '^[a-z]{4}[0-9]{2}$' then 'patente'
    when t in ('hola','buenas','buenos dias','buenos días','buenas tardes','buenas noches','menu','menú','hi','hello') then 'saludo/menu'
    when t in ('1','precios','precio','servicios') then 'op1 precios'
    when t in ('2','contratar','quiero el plan','quiero contratar el plan') then 'op2 contratar'
    when t in ('3','horario','horarios','ubicacion','ubicación') then 'op3 horario'
    when t in ('4','humano','ayuda','persona') then 'op4 humano'
    when t in ('5','descuento','dscto') then 'op5 descuento'
    when t in ('s','m','l','xl') then 'tamano/otro'
    else 'NO RECONOCIDO -> devuelve menu' end clase,
    count(*)::int n
  from m group by 1 order by n desc`);

p("Op2 (contratar): pidieron plan -> compraron plan despues?", await sql`
  with pidio as (
    select c.id, c.telefono, c.cliente_id, min(m.creado_en) cuando
    from conversaciones_whatsapp c join mensajes_whatsapp m on m.conversacion_id=c.id
    where m.direccion='entrante'
      and lower(btrim(m.texto)) in ('2','contratar','quiero el plan','quiero contratar el plan')
    group by 1,2,3)
  select count(*)::int pidieron,
         count(*) filter (where exists (
            select 1 from ventas v where v.cliente_id = pidio.cliente_id
              and v.fecha > pidio.cuando and v.tipo in ('Plan nuevo','Renovación','Renovacion')
         ))::int compraron_plan_despues
  from pidio`);

p("Op4 (humano): cuantos y respuesta humana", await sql`
  with pidio as (
    select c.id conv, m.creado_en cuando
    from conversaciones_whatsapp c join mensajes_whatsapp m on m.conversacion_id=c.id
    where m.direccion='entrante' and lower(btrim(m.texto)) in ('4','humano','ayuda','persona')),
  resp as (
    select pidio.conv, pidio.cuando,
      (select min(o.creado_en) from mensajes_whatsapp o
        where o.conversacion_id=pidio.conv and o.direccion='saliente'
          and o.enviado_por is not null and o.creado_en > pidio.cuando) primera_humana
    from pidio)
  select count(*)::int pedidos,
         count(primera_humana)::int respondidos_por_humano,
         round(avg(extract(epoch from (primera_humana-cuando))/60)::numeric,1) min_promedio,
         round((percentile_cont(0.5) within group (order by extract(epoch from (primera_humana-cuando))/60))::numeric,1) min_mediana
  from resp`);

p("Op5 (descuento): iniciaron -> cupon emitido -> usado", await sql`
  select
    (select count(distinct c.id)::int from conversaciones_whatsapp c
       join mensajes_whatsapp m on m.conversacion_id=c.id
      where m.direccion='entrante' and lower(btrim(m.texto)) in ('5','descuento','dscto')) iniciaron,
    (select count(*)::int from cupones where nombre_lote='WhatsApp - Primera vez') cupones_emitidos,
    (select count(*)::int from cupones where nombre_lote='WhatsApp - Primera vez' and usado) cupones_usados`);

p("Clientes creados por el bot -> compraron algo?", await sql`
  select count(*)::int creados_por_bot,
         count(*) filter (where exists (select 1 from ventas v where v.cliente_id=cl.id))::int con_alguna_venta,
         count(*) filter (where cl.vencimiento is not null)::int con_plan_hoy
  from clientes cl where cl.creado_por='whatsapp-bot'`);

p("Salientes por origen (quien manda)", await sql`
  select coalesce(enviado_por,'(bot automatico)') quien, count(*)::int n,
         count(*) filter (where estado='fallido')::int fallidos
  from mensajes_whatsapp where direccion='saliente' group by 1 order by n desc limit 15`);

p("Reglas activas y disparos", await sql`
  select r.nombre, r.tipo_evento, r.activa, count(d.id)::int disparos
  from reglas_whatsapp r left join disparos_regla_whatsapp d on d.regla_id=r.id
  group by 1,2,3 order by disparos desc`);

p("Conversaciones sin NINGUNA respuesta humana jamas", await sql`
  select count(*)::int total_convs,
         count(*) filter (where not exists (
           select 1 from mensajes_whatsapp m where m.conversacion_id=c.id
             and m.direccion='saliente' and m.enviado_por is not null))::int nunca_toco_un_humano
  from conversaciones_whatsapp c`);

p("Los NO RECONOCIDOS: 80 ejemplos reales", await sql`
  with m as (select lower(btrim(texto)) t, count(*)::int n from mensajes_whatsapp
             where direccion='entrante' group by 1)
  select t, n from m
  where not (t ~ '^[a-z]{2}[0-9]{4}$' or t ~ '^[a-z]{4}[0-9]{2}$')
    and t not in ('hola','buenas','buenos dias','buenos días','buenas tardes','buenas noches','menu','menú','hi','hello',
                  '1','precios','precio','servicios','2','contratar','quiero el plan','quiero contratar el plan',
                  '3','horario','horarios','ubicacion','ubicación','4','humano','ayuda','persona',
                  '5','descuento','dscto','s','m','l','xl')
    and left(t,1) <> '[' and length(t) > 2
  order by n desc, length(t) desc limit 80`);

p("Por que fallan los envios (top errores)", await sql`
  select coalesce(enviado_por,'(bot)') quien, left(coalesce(error,'?'),110) err, count(*)::int n
  from mensajes_whatsapp where estado='fallido' group by 1,2 order by n desc limit 12`);

p("Ultimo mensaje de la conversacion: quien tuvo la ultima palabra", await sql`
  with u as (select distinct on (conversacion_id) conversacion_id, direccion, enviado_por, texto
             from mensajes_whatsapp order by conversacion_id, creado_en desc)
  select case when direccion='entrante' then 'CLIENTE (quedo sin respuesta)'
              when enviado_por is null then 'bot automatico'
              else 'humano' end quien, count(*)::int n
  from u group by 1 order by n desc`);

p("Conversaciones que terminaron con el cliente hablando: que dijeron", await sql`
  with u as (select distinct on (conversacion_id) conversacion_id, direccion, texto, creado_en
             from mensajes_whatsapp order by conversacion_id, creado_en desc)
  select left(texto,90) ultimo_texto, count(*)::int n
  from u where direccion='entrante' group by 1 order by n desc limit 25`);

p("Ventana 24h: cuantas conversaciones estan hoy fuera de ventana", await sql`
  select count(*) filter (where now() - ultimo_mensaje_en < interval '24 hours')::int dentro_24h,
         count(*) filter (where now() - ultimo_mensaje_en >= interval '24 hours')::int fuera_24h
  from conversaciones_whatsapp`);

p("Plantillas con meta_nombre aprobado (municion para iniciar conversacion)", await sql`
  select nombre, meta_nombre, meta_aprobado, activo from plantillas_whatsapp order by meta_aprobado desc, nombre limit 20`);

p("Fallidos por dia y texto/plantilla", await sql`
  select to_char(creado_en,'YYYY-MM-DD') dia, left(texto,60) que, coalesce(enviado_por,'bot') quien,
         left(coalesce(error,'?'),50) err, count(*)::int n
  from mensajes_whatsapp where estado='fallido' group by 1,2,3,4 order by dia desc, n desc limit 25`);

p("Salientes por dia: enviados vs fallidos (ultimos 20 dias con actividad)", await sql`
  select to_char(creado_en,'YYYY-MM-DD') dia,
         count(*) filter (where estado <> 'fallido')::int ok,
         count(*) filter (where estado = 'fallido')::int fallidos
  from mensajes_whatsapp where direccion='saliente' group by 1 order by dia desc limit 20`);

p("Op4 humano: los 30 que NO fueron respondidos, cuando pidieron", await sql`
  with pidio as (
    select c.id conv, c.telefono, m.creado_en cuando
    from conversaciones_whatsapp c join mensajes_whatsapp m on m.conversacion_id=c.id
    where m.direccion='entrante' and lower(btrim(m.texto)) in ('4','humano','ayuda','persona'))
  select to_char(cuando,'YYYY-MM-DD') dia, count(*)::int pidieron,
         count(*) filter (where not exists (
           select 1 from mensajes_whatsapp o where o.conversacion_id=pidio.conv
             and o.direccion='saliente' and o.enviado_por is not null and o.creado_en>pidio.cuando))::int sin_respuesta_humana
  from pidio group by 1 order by dia desc limit 20`);

p("Ingresos/lavados: cuantos clientes con conversacion volvieron al tunel despues de escribir", await sql`
  select count(distinct c.cliente_id)::int clientes_con_conversacion,
         count(distinct c.cliente_id) filter (where exists (
            select 1 from ventas v where v.cliente_id=c.cliente_id and v.fecha > c.creado_en))::int compraron_algo_despues
  from conversaciones_whatsapp c where c.cliente_id is not null`);

await sql.end();
