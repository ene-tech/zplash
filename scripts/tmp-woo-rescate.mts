// SOLO LECTURA: estado actual de los clientes que quedaron colgados por el
// staging lock de WooCommerce (los 174 pedidos de renovacion que se cancelaron
// junto con sus suscripciones). Sirve para decidir a quien se rescata y con que.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-rescate.mts <archivo-de-patentes>
import { readFileSync } from "node:fs";
import postgres from "postgres";

const patentes = readFileSync(process.argv[2], "utf8").split(/\s+/).filter(Boolean);
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const filas = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  return tx`
    select c.patente, c.nombre, c.email, c.telefono, c.vencimiento, c.precio_plan_heredado,
           (c.vencimiento is not null and c.vencimiento < now()) vencido,
           (select count(*) from suscripciones_oneclick s where s.cliente_id = c.id and s.estado in ('activa','pendiente')) oneclick,
           (select count(*) from cupones cu where cu.patente_asignada = c.patente and cu.tipo = 'descuento' and cu.usado = false and cu.fecha_caducidad > now()) cupon,
           (select max(v.fecha) from ventas v where v.cliente_id = c.id and v.precio >= 10000) ultima_venta
    from clientes c
    where c.patente in ${tx(patentes)}`;
});
await sql.end();

const n = (f: (x: any) => boolean) => filas.filter(f).length;
const dias = (d: any) => Math.round((Date.now() - new Date(d).getTime()) / 864e5);

console.log(`Clientes encontrados: ${filas.length} de ${patentes.length} patentes`);
console.log(`  Vigentes hoy:            ${n((f) => !f.vencido && f.vencimiento)}`);
console.log(`  Vencidos:                ${n((f) => f.vencido)}`);
console.log(`  Sin plan (vencimiento nulo): ${n((f) => !f.vencimiento)}`);
console.log(`  Ya con Oneclick nuestro: ${n((f) => Number(f.oneclick) > 0)}`);
console.log(`  Con cupon de descuento vivo: ${n((f) => Number(f.cupon) > 0)}`);
console.log(`  Con email:               ${n((f) => f.email)}`);
console.log(`  Con telefono:            ${n((f) => f.telefono)}`);
console.log(`  Sin email NI telefono:   ${n((f) => !f.email && !f.telefono)}`);
console.log(`  Con precio heredado:     ${n((f) => f.precio_plan_heredado)}`);

const vencidos = filas.filter((f) => f.vencido);
const tramos = { "1-7 dias": 0, "8-15 dias": 0, "16-30 dias": 0, "31+ dias": 0 } as Record<string, number>;
for (const f of vencidos) {
  const d = dias(f.vencimiento);
  tramos[d <= 7 ? "1-7 dias" : d <= 15 ? "8-15 dias" : d <= 30 ? "16-30 dias" : "31+ dias"]++;
}
console.log(`\nVencidos por antiguedad (dias desde el vencimiento):`);
for (const [k, v] of Object.entries(tramos)) console.log(`  ${k.padEnd(12)} ${v}`);

console.log(`\nVigentes que quedaron sin renovacion automatica (hay que engancharlos a Oneclick antes de que venzan):`);
for (const f of filas.filter((x) => !x.vencido && x.vencimiento && Number(x.oneclick) === 0).sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento)))) {
  console.log(`  ${f.patente} ${String(f.nombre).slice(0, 28).padEnd(28)} vence ${new Date(f.vencimiento).toISOString().slice(0, 10)} ${f.email ? "" : "(SIN EMAIL)"}`);
}
