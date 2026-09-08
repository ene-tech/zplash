// SOLO LECTURA (corre dentro de una transacción `read only`, igual que
// scripts/q.mts: la garantía la da el motor, no el texto del SQL).
//
// Auditoría de la Promo 2 Lavados (ver PROMO_2_LAVADOS_KEY en
// @/lib/helpers/precios): a cada patente a la que se le vendió la promo,
// ¿le quedaron sus 2 tickets y el segundo sigue canjeable hoy?
//
// La promo no es un plan: son 2 cupones "vale" (nombre_lote = "Promo 2
// Lavados") atados a la patente por `patentes_autorizadas`, con 30 días de
// vigencia. En el mesón se entrega con el primero ya canjeado (el auto entra
// en ese momento); por web se emiten los 2 sin usar. El mostrador solo ofrece
// un ticket si cumple TODAS las condiciones de ticketsVigentesDePatente:
//
//   tipo = 'vale' AND NOT usado AND fecha_caducidad > now()
//   AND patentes_autorizadas contiene la patente normalizada del cliente
//
// Por eso acá no basta con contar cupones: se revisa cada condición por
// separado, que es donde se esconde un ticket que existe en la base y aun así
// no le aparece al operador.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-promo-2-lavados.mts
//      PATENTE=RBYW27 npx tsx --env-file=.env.local scripts/diag-promo-2-lavados.mts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const p = (t: string, r: unknown) => console.log("\n### " + t + "\n" + JSON.stringify(r, null, 1));

// Mismo criterio que normPlate (@/lib/helpers/validadores): mayúsculas y solo
// alfanumérico. Sin esto una patente guardada con guion no cruza con la lista
// de autorizadas del cupón. Se sanea acá y se interpola: el runner es
// read-only, y el valor queda acotado a [A-Z0-9].
const PATENTE = (process.env.PATENTE || "RBYW27").toUpperCase().replace(/[^A-Z0-9]/g, "");
const norm = (col: string) => `upper(regexp_replace(coalesce(${col}, ''), '[^A-Za-z0-9]', '', 'g'))`;
const TIPOS = `('Promo 2 Lavados', 'Promo 2 Lavados (Web)')`;

// Cada emisión de la promo son 2 cupones con ids `${idBase}-1` / `${idBase}-2`
// (ver cuponesPromo2Lavados), así que el prefijo del id identifica la compra:
// es la única forma de agrupar, porque no hay id de lote en la tabla.
// `disponibles` replica ticketsVigentesDePatente condición por condición.
const LOTES = `
  select regexp_replace(c.id, '-[0-9]+$', '') lote,
         ${norm("c.patente_asignada")} pat,
         min(c.creado_en) emitido,
         min(c.fecha_caducidad) vence,
         count(*)::int emitidos,
         count(*) filter (where c.usado)::int usados,
         count(*) filter (where not c.usado and c.fecha_caducidad > now() and c.tipo = 'vale'
           and (c.patentes_autorizadas ? ${norm("c.patente_asignada")}))::int disponibles,
         count(*) filter (where not c.usado and c.fecha_caducidad <= now())::int vencidos_sin_usar,
         count(*) filter (where c.patentes_autorizadas is null)::int sin_patente_autorizada
  from cupones c
  where c.nombre_lote = 'Promo 2 Lavados'
  group by 1, 2`;

const VENTAS = `
  select id, ${norm("patente")} pat, nombre, fecha, precio::int precio, tipo, creado_por, metodo_pago
  from ventas where tipo in ${TIPOS}`;

// El cruce venta -> lote: no hay FK entre ambos, así que se toma el lote de la
// misma patente emitido más cerca en el tiempo de la venta. Los dos caminos
// que emiten (mesón y retorno de Webpay) lo hacen dentro de la misma
// operación, así que esa distancia es de segundos.
const CRUCE = `
  from v left join lateral (
    select * from l where l.pat = v.pat
    order by abs(extract(epoch from (l.emitido - v.fecha))) limit 1) l on true`;

const CONSULTAS: [string, string][] = [
  [
    "1. Resumen: ventas de la promo vs tickets emitidos",
    `with l as (${LOTES}), v as (${VENTAS})
     select (select count(*)::int from v) ventas_promo,
            (select coalesce(sum(precio), 0)::int from v) vendido_clp,
            (select count(*)::int from l) lotes_emitidos,
            (select coalesce(sum(emitidos), 0)::int from l) tickets_emitidos,
            (select coalesce(sum(usados), 0)::int from l) tickets_usados,
            (select coalesce(sum(disponibles), 0)::int from l) tickets_disponibles_hoy,
            (select coalesce(sum(vencidos_sin_usar), 0)::int from l) tickets_vencidos_sin_usar`,
  ],
  [
    "2. UNA FILA POR VENTA: ¿tiene disponible su segundo lavado?",
    `with l as (${LOTES}), v as (${VENTAS})
     select v.pat patente, v.nombre, to_char(v.fecha, 'YYYY-MM-DD HH24:MI') vendida, v.precio,
            case when v.tipo like '%Web%' then 'WEB' else 'LOCAL' end canal, v.creado_por vendio,
            coalesce(l.emitidos, 0) emitidos, coalesce(l.usados, 0) usados,
            coalesce(l.disponibles, 0) disponibles, coalesce(l.vencidos_sin_usar, 0) vencidos,
            to_char(l.vence, 'YYYY-MM-DD') vence,
            case
              when l.lote is null then 'SIN TICKETS: quedó la venta y no quedó ningún cupón'
              when l.emitidos < 2 then 'LOTE INCOMPLETO: se emitieron ' || l.emitidos || ' de 2'
              when l.sin_patente_autorizada > 0 then 'TICKET SIN PATENTE AUTORIZADA: existe pero el mesón no lo ofrece'
              when l.disponibles > 0 then 'OK: ' || l.disponibles || ' disponible(s)'
              when l.vencidos_sin_usar > 0 then 'VENCIDO SIN USAR: ' || l.vencidos_sin_usar || ' ticket(s) caducaron'
              else 'CONSUMIDA: los 2 tickets se usaron'
            end diagnostico
     ${CRUCE}
     order by v.fecha desc`,
  ],
  [
    "3. CASOS ROTOS: ventas de la promo sin sus 2 tickets",
    `with l as (${LOTES}), v as (${VENTAS})
     select v.pat patente, v.nombre, to_char(v.fecha, 'YYYY-MM-DD HH24:MI') vendida, v.precio,
            case when v.tipo like '%Web%' then 'WEB' else 'LOCAL' end canal, v.creado_por vendio,
            v.metodo_pago, coalesce(l.emitidos, 0) tickets_encontrados,
            (select count(*)::int from ingresos i
              where ${norm("i.patente")} = v.pat
                and i.fecha between v.fecha - interval '10 minutes' and v.fecha + interval '10 minutes') ingreso_ese_rato
     ${CRUCE}
     where coalesce(l.emitidos, 0) < 2
     order by v.fecha desc`,
  ],
  [
    "4. Lotes de tickets sin venta que los respalde (regalados o venta perdida)",
    `with l as (${LOTES})
     select l.pat patente, to_char(l.emitido, 'YYYY-MM-DD HH24:MI') emitido,
            l.emitidos, l.usados, l.disponibles
     from l
     where not exists (
       select 1 from ventas v
       where ${norm("v.patente")} = l.pat and v.tipo in ${TIPOS}
         and v.fecha between l.emitido - interval '1 hour' and l.emitido + interval '1 hour')
     order by l.emitido desc`,
  ],
  [
    "5. Tickets vivos que el mesón NO ofrecería (la patente ya no cuadra)",
    `select c.codigo, c.patente_asignada, c.patentes_autorizadas,
            to_char(c.creado_en, 'YYYY-MM-DD') emitido, to_char(c.fecha_caducidad, 'YYYY-MM-DD') vence,
            (select cl.patente from clientes cl
              where ${norm("cl.patente")} = ${norm("c.patente_asignada")} limit 1) ficha_con_esa_patente
     from cupones c
     where c.nombre_lote = 'Promo 2 Lavados' and not c.usado and c.fecha_caducidad > now()
       and (c.patentes_autorizadas is null
         or not (c.patentes_autorizadas ? ${norm("c.patente_asignada")}))
     order by c.creado_en desc`,
  ],
  [
    `6. Detalle de ${PATENTE}: cupones de la promo`,
    `select codigo, id, numero_lote, total_lote, usado, patente_asignada, patentes_autorizadas,
            to_char(creado_en, 'YYYY-MM-DD HH24:MI') emitido, to_char(fecha_caducidad, 'YYYY-MM-DD') vence,
            to_char(fecha_uso, 'YYYY-MM-DD HH24:MI') usado_el, operador_uso, valor::int valor, creado_por
     from cupones
     where ${norm("patente_asignada")} = '${PATENTE}' or (patentes_autorizadas ? '${PATENTE}'::text)
     order by creado_en desc, numero_lote`,
  ],
  [
    `7. Detalle de ${PATENTE}: ventas`,
    `select id, tipo, precio::int precio, to_char(fecha, 'YYYY-MM-DD HH24:MI') fecha,
            metodo_pago, creado_por, cupon_codigo, via_cupon
     from ventas where ${norm("patente")} = '${PATENTE}' order by fecha desc limit 20`,
  ],
  [
    `8. Detalle de ${PATENTE}: ingresos al túnel`,
    `select id, to_char(fecha, 'YYYY-MM-DD HH24:MI') fecha, plan_estado_al_ingreso,
            via_cupon, cupon_codigo, glosa, creado_por
     from ingresos where ${norm("patente")} = '${PATENTE}' order by fecha desc limit 20`,
  ],
];

try {
  await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    for (const [titulo, consulta] of CONSULTAS) p(titulo, await tx.unsafe(consulta));
  });
} finally {
  await sql.end();
}
