// Auditoría de incongruencias de planes/fechas/productos (SOLO LECTURA).
// Uso: npx tsx --env-file=.env.local scripts/tmp-audit.ts
import { writeFileSync } from "node:fs";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });
const HOY = "(now() at time zone 'America/Santiago')::date";
const VP = "v.tipo not ilike '%lavado%' and v.plan <> '' and v.es_servicio_adicional = false"; // venta de plan
// Pares de ventas de plan del mismo cliente separadas por menos de 5 días.
const PARES = `with vp as (
    select v.*, lag(v.fecha) over (partition by v.cliente_id order by v.fecha) pf,
           lag(v.tipo) over (partition by v.cliente_id order by v.fecha) pt,
           lag(v.precio) over (partition by v.cliente_id order by v.fecha) pp,
           lag(v.creado_por) over (partition by v.cliente_id order by v.fecha) ppor
    from ventas v where ${VP})`;

type Check = { id: string; titulo: string; grav: "ALTA" | "MEDIA" | "BAJA"; q: string };
const CHECKS: Check[] = [
  {
    id: "A", grav: "ALTA", titulo: "Plan pagado en los últimos 90 días y ficha SIN plan",
    q: `select c.patente, c.nombre, 'pagó ' || v.tipo || ' $' || v.precio::int || ' el ' || v.fecha::date || ' (' || coalesce(v.creado_por,'?') || ')' detalle, v.fecha::date ref
        from clientes c join ventas v on v.cliente_id = c.id
        where coalesce(c.plan,'') = '' and ${VP} and v.fecha > now() - interval '90 days'`,
  },
  {
    id: "B", grav: "ALTA", titulo: "Renovación cobrada que NO movió el vencimiento",
    q: `with ult as (select distinct on (v.cliente_id) v.cliente_id, v.fecha, v.tipo, v.precio from ventas v where ${VP} order by v.cliente_id, v.fecha desc)
        select c.patente, c.nombre, 'último pago ' || u.tipo || ' $' || u.precio::int || ' el ' || u.fecha::date || ' pero vence ' || c.vencimiento::date detalle, u.fecha::date ref
        from clientes c join ult u on u.cliente_id = c.id
        where c.vencimiento is not null and c.vencimiento::date < u.fecha::date and u.fecha > now() - interval '120 days'`,
  },
  {
    id: "C", grav: "ALTA", titulo: "Renovación automática Oneclick vencida y sin un solo intento de cobro",
    q: `select s.patente, coalesce(c.nombre, s.email) nombre,
               'tarjeta inscrita el ' || s.creado_en::date || ', cobro vencía el ' || s.proximo_cobro::date || ', 0 intentos registrados' detalle, s.proximo_cobro::date ref
        from suscripciones_oneclick s
        left join clientes c on upper(replace(c.patente,'-','')) = upper(replace(s.patente,'-',''))
        where s.estado = 'activa' and s.proximo_cobro::date < ${HOY}
          and not exists (select 1 from cobros_oneclick co where co.suscripcion_id = s.id)`,
  },
  {
    id: "D", grav: "ALTA", titulo: "Doble cobro de plan (2 ventas en menos de 5 días, sin contar el importador)",
    q: `${PARES}
        select c.patente, c.nombre, vp.pt || ' $' || vp.pp::int || ' (' || coalesce(vp.ppor,'?') || ') el ' || vp.pf::date ||
               ' + ' || vp.tipo || ' $' || vp.precio::int || ' (' || coalesce(vp.creado_por,'?') || ') el ' || vp.fecha::date ||
               ' => vence ' || coalesce(c.vencimiento::date::text,'(null)') detalle, vp.fecha::date ref
        from vp join clientes c on c.id = vp.cliente_id
        where vp.pf is not null and vp.fecha - vp.pf < interval '5 days'
          and coalesce(vp.ppor,'') not ilike 'Migraci%' and coalesce(vp.creado_por,'') not ilike 'Migraci%'`,
  },
  {
    id: "E", grav: "MEDIA", titulo: "Vencimiento apilado: más de 45 días por delante",
    q: `select patente, nombre, 'vence ' || vencimiento::date || ' (' || (vencimiento::date - ${HOY}) || ' días por delante), plan ' || coalesce(plan,'(null)') detalle, vencimiento::date ref
        from clientes where vencimiento::date > ${HOY} + interval '45 days'`,
  },
  {
    id: "F", grav: "MEDIA", titulo: "Monto de plan atípico (3 o menos casos en 120 días)",
    q: `with montos as (select v.precio, count(*) n from ventas v where ${VP} and v.fecha > now() - interval '120 days' group by 1)
        select v.patente, v.nombre, v.tipo || ' $' || v.precio::int || ' el ' || v.fecha::date || ' (' || coalesce(v.creado_por,'?') || ')' detalle, v.fecha::date ref
        from ventas v join montos m on m.precio = v.precio
        where ${VP} and v.fecha > now() - interval '120 days' and m.n <= 3`,
  },
  {
    id: "G", grav: "MEDIA", titulo: "Plan vigente cargado a mano: nunca hubo una venta de plan",
    q: `select c.patente, c.nombre, 'plan ' || c.plan || ' vigente hasta ' || c.vencimiento::date || ', 0 ventas de plan, alta ' || coalesce(c.creado_por,'?') detalle, c.vencimiento::date ref
        from clientes c
        where coalesce(c.plan,'') <> '' and c.vencimiento::date >= ${HOY}
          and not exists (select 1 from ventas v where v.cliente_id = c.id and ${VP})`,
  },
  {
    id: "H", grav: "MEDIA", titulo: "Cobro automático de WooCommerce vigente pero sin renovar desde que se cortó el webhook (14-ago)",
    q: `select c.patente, c.nombre, 'marca de cobro auto Woo del ' || c.renovacion_auto_woo_desde::date || ', vence ' || c.vencimiento::date ||
               ', última renovación ' || coalesce((select max(v.fecha)::date::text from ventas v where v.cliente_id = c.id and ${VP}),'(ninguna)') detalle, c.vencimiento::date ref
        from clientes c where c.renovacion_auto_woo_desde is not null and c.vencimiento::date < ${HOY}`,
  },
  {
    id: "I", grav: "MEDIA", titulo: "Venta ligada a un cliente con OTRA patente",
    q: `select c.patente, c.nombre, 'venta ' || v.tipo || ' del ' || v.fecha::date || ' dice patente ' || v.patente || ' / nombre ' || v.nombre detalle, v.fecha::date ref
        from ventas v join clientes c on c.id = v.cliente_id
        where v.patente <> '' and upper(replace(v.patente,'-','')) <> upper(replace(c.patente,'-','')) and v.fecha > now() - interval '180 days'`,
  },
  {
    id: "J", grav: "MEDIA", titulo: "Historial de plan colgado de una ficha sin plan (patente reutilizada)",
    q: `select c.patente, c.nombre, 'ficha sin plan con ' || count(*) || ' ventas de plan a nombre de ' || string_agg(distinct v.nombre, ' / ') ||
               ' (última ' || max(v.fecha)::date || ')' detalle, max(v.fecha)::date ref
        from clientes c join ventas v on v.cliente_id = c.id
        where coalesce(c.plan,'') = '' and ${VP} and upper(v.nombre) <> upper(c.nombre)
        group by c.id, c.patente, c.nombre`,
  },
  {
    id: "K", grav: "BAJA", titulo: "Vencimiento anterior a la contratación / fechas futuras imposibles",
    q: `select patente, nombre, 'contrató ' || fecha_contratacion::date || ' y vence ' || vencimiento::date detalle, vencimiento::date ref
        from clientes where fecha_contratacion is not null and vencimiento is not null and vencimiento::date < fecha_contratacion::date
        union all
        select patente, nombre, 'contratación futura ' || fecha_contratacion::date, fecha_contratacion::date from clientes where fecha_contratacion::date > ${HOY}
        union all
        select v.patente, v.nombre, 'venta ' || v.tipo || ' con fecha futura ' || v.fecha::date, v.fecha::date from ventas v where v.fecha::date > ${HOY}`,
  },
  {
    id: "L", grav: "BAJA", titulo: "Arrastre del ilimitado incoherente / plan sin vencimiento (o al revés)",
    q: `select patente, nombre, 'ilimitado_hasta ' || ilimitado_hasta::date || ', vence ' || coalesce(vencimiento::date::text,'(null)') || ', plan ' || coalesce(plan,'(null)') detalle, ilimitado_hasta::date ref
        from clientes where ilimitado_hasta is not null and (plan <> 'Plan X5' or vencimiento is null or ilimitado_hasta > vencimiento)
        union all
        select patente, nombre, 'plan=' || coalesce(nullif(plan,''),'(vacío)') || ' vencimiento=' || coalesce(vencimiento::date::text,'(null)'), vencimiento::date
        from clientes where (coalesce(plan,'') = '' and vencimiento is not null) or (coalesce(plan,'') <> '' and vencimiento is null)`,
  },
  {
    id: "M", grav: "BAJA", titulo: "Venta huérfana (sin cliente_id) cuya patente sí existe en la base",
    q: `select c.patente, c.nombre, 'venta ' || v.tipo || ' $' || v.precio::int || ' del ' || v.fecha::date || ' sin cliente_id' detalle, v.fecha::date ref
        from ventas v join clientes c on upper(replace(c.patente,'-','')) = upper(replace(v.patente,'-',''))
        where v.cliente_id is null and v.fecha > now() - interval '180 days'`,
  },
  {
    id: "N", grav: "BAJA", titulo: "Producto pagado y no entregado / tope del X5 excedido",
    q: `select v.patente, v.nombre, 'lavado único web pagado ' || v.fecha::date || ' $' || v.precio::int || ' sin canjear' detalle, v.fecha::date ref
        from ventas v where v.tipo = 'Lavado único (Web)' and v.canjeada_en is null and v.fecha < now() - interval '30 days'
        union all
        select c.patente, c.nombre, count(i.id) || ' pasadas en el ciclo X5 que vence ' || c.vencimiento::date, c.vencimiento::date
        from clientes c join ingresos i on i.cliente_id = c.id
        where c.plan = 'Plan X5' and c.vencimiento::date >= ${HOY} and c.ilimitado_hasta is null
          and i.fecha >= c.vencimiento - interval '1 month' and i.es_garantia = false
        group by c.id, c.patente, c.nombre, c.vencimiento having count(i.id) > 5`,
  },
];

async function main() {
  const hoy = ((await sql.unsafe(`select ${HOY} d`))[0].d as Date).toISOString().slice(0, 10);
  console.log("Auditoría al " + hoy);
  const csv: string[] = ["chequeo;gravedad;titulo;patente;nombre;detalle;fecha_ref"];
  for (const c of CHECKS) {
    let rows: Record<string, unknown>[];
    try {
      rows = (await sql.unsafe(c.q)) as unknown as Record<string, unknown>[];
    } catch (e) {
      console.log(`\n[${c.id}] ERROR: ${(e as Error).message}`);
      continue;
    }
    console.log(`\n[${c.id}] ${c.grav} - ${c.titulo}: ${rows.length}`);
    for (const r of rows.slice(0, 8)) console.log(`   ${r.patente} ${r.nombre} - ${r.detalle}`);
    if (rows.length > 8) console.log(`   ... y ${rows.length - 8} mas`);
    for (const r of rows) {
      const ref = r.ref instanceof Date ? r.ref.toISOString().slice(0, 10) : r.ref;
      csv.push([c.id, c.grav, c.titulo, r.patente, r.nombre, r.detalle, ref].map((x) => String(x ?? "").replace(/[;\n]/g, ",")).join(";"));
    }
  }
  writeFileSync(`auditoria-planes-${hoy}.csv`, "﻿" + csv.join("\n"), "utf8");
  console.log(`\nCSV: auditoria-planes-${hoy}.csv (${csv.length - 1} hallazgos)`);
  await sql.end();
}
main();
