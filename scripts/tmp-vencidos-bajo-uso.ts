import * as XLSX from "xlsx";
// Informe puntual (SOLO LECTURA): clientes con el plan vencido y bajo uso
// (5 pasadas o menos en el último período que sí pagaron — mismo eje "veces"
// que usa la promo de reactivación, ver visitasUltimoPeriodoVencido).
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });
const HOY = sql`(now() at time zone 'America/Santiago')::date`;
const MAX_VISITAS = 5;

// Un pago es "Web" si lo registró el flujo online (Webpay/Oneclick/Woo) y no
// una persona en el mesón — mismos marcadores que scripts/tmp-ilimitado.ts.
const ES_WEB = sql`(u.creado_por ilike 'Autom%' or u.creado_por ilike 'Cliente (One%'
  or u.creado_por ilike 'Migraci%' or u.creado_por ilike 'WooCom%' or u.tipo ilike '%(Web)%')`;

async function main() {
  const gracia = (await sql`select dias_gracia_pago_atrasado g from config limit 1`)[0]?.g ?? 4;

  const filas = await sql`
    with pagos as (
      select distinct on (v.cliente_id) v.cliente_id, v.fecha, v.tipo, v.precio, v.creado_por
      from ventas v
      where v.es_servicio_adicional = false
        and (v.tipo ilike '%renovaci%' or v.tipo ilike '%reactivaci%' or v.tipo ilike 'Plan nuevo%')
      order by v.cliente_id, v.fecha desc
    )
    select c.nombre, c.patente, c.telefono, c.email, c.plan,
           c.origen alta,
           case when u.cliente_id is null then 'SIN PAGO REGISTRADO'
                when ${ES_WEB} then 'WEB' else 'LOCAL' end canal_ultimo_pago,
           c.vencimiento::date vencimiento,
           (${HOY} - c.vencimiento::date) dias_vencido,
           case when (${HOY} - c.vencimiento::date) <= ${gracia} then 'en gracia' else 'no renovó' end estado,
           (select count(*) from ingresos i where i.cliente_id = c.id
              and i.fecha >= c.vencimiento - interval '1 month' and i.fecha < c.vencimiento)::int visitas_ultimo_periodo,
           (select count(*) from ingresos i where i.cliente_id = c.id)::int visitas_totales,
           c.ultima_visita::date ultima_visita,
           u.fecha::date ultimo_pago, u.tipo tipo_ultimo_pago, u.precio::int monto_ultimo_pago,
           u.creado_por registrado_por
    from clientes c
    left join pagos u on u.cliente_id = c.id
    where c.vencimiento is not null and c.vencimiento::date < ${HOY}
      and (select count(*) from ingresos i where i.cliente_id = c.id
             and i.fecha >= c.vencimiento - interval '1 month' and i.fecha < c.vencimiento) <= ${MAX_VISITAS}
    order by dias_vencido asc`;

  const cols = Object.keys(filas[0]);
  const rows = filas.map((r) => Object.fromEntries(cols.map((k) => {
    const v = (r as Record<string, unknown>)[k];
    // Las fechas van como texto ISO (no como celda de fecha) a propósito: el
    // ::date de Postgres llega como Date a medianoche UTC y SheetJS la
    // convierte a hora local, lo que en Chile (UTC-4) restaba un día. Ordenar
    // por ISO igual sale cronológico.
    return [k, v instanceof Date ? v.toISOString().slice(0, 10) : v];
  })));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!autofilter"] = { ref: ws["!ref"]! };
  ws["!cols"] = cols.map((k) => ({ wch: Math.min(30, Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vencidos bajo uso");
  const out = "clientes-vencidos-bajo-uso-2026-08-27.xlsx";
  XLSX.writeFile(wb, out);

  const por = (k: string) => filas.reduce<Record<string, number>>((a, r) => {
    const v = String((r as Record<string, unknown>)[k]); a[v] = (a[v] ?? 0) + 1; return a; }, {});
  console.log(`${out}: ${filas.length} filas`);
  console.log("por canal del último pago:", por("canal_ultimo_pago"));
  console.log("por estado:", por("estado"));
  console.log("por visitas del último período:", por("visitas_ultimo_periodo"));
  await sql.end();
}
main();
