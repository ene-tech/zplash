// SOLO LECTURA: cuantas acciones comerciales tiene disponibles cada cliente al
// mismo tiempo, que es lo que el operador ve como ventanas al momento de que el
// auto entra al tunel.
//
// Usa calcularOfertasPlan (la funcion PURA, no calcularOfertasPlanDeCliente):
// esa hace 4 consultas por cliente y con miles de clientes no termina nunca.
// Aca se cargan ventas/ingresos/config/precios una sola vez y se recorre en
// memoria. Canal LOCAL, que es el del meson.
//
// Cuenta como accion cada cosa que el operador puede decirle o cobrarle:
// renovar, reactivar, pagar atrasado, upgrade, contratar, y los dos avisos de
// cupon (ver OperadorFoundOfertas.tsx, que las pinta una debajo de otra).
//
// Uso: npx tsx --env-file=.env.local scripts/diag-acciones-comerciales.mts
import postgres from "postgres";
import { calcularOfertasPlan } from "@/lib/helpers/ofertasPlan";
import { configFromRow } from "@/lib/dataAccess/config";
import { preciosFromRows } from "@/lib/dataAccess/precios";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { ventaFromRow } from "@/lib/dataAccess/ventas";
import { ingresoFromRow } from "@/lib/dataAccess/ingresos";
import { etapaCliente, ETIQUETA_ETAPA } from "@/lib/helpers/recorrido";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const { cl, ven, ing, cfg, pre, cup } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return {
      cl: await tx.unsafe(`select * from clientes`),
      ven: await tx.unsafe(`select * from ventas where fecha > now() - interval '14 months'`),
      ing: await tx.unsafe(`select * from ingresos where fecha > now() - interval '14 months'`),
      cfg: await tx.unsafe(`select * from config limit 1`),
      pre: await tx.unsafe(`select * from precios`),
      cup: await tx.unsafe(`select patente_asignada, valor, tipo from cupones where not usado and fecha_caducidad >= now() and patente_asignada is not null`),
    } as any;
  });

  const config = configFromRow((cfg as any[])[0]);
  const precios = preciosFromRows(pre as any[]);
  const porCliente = new Map<string, { v: any[]; i: any[] }>();
  for (const v of ven as any[]) {
    if (!v.cliente_id) continue;
    const e = porCliente.get(v.cliente_id) || { v: [], i: [] };
    e.v.push(ventaFromRow(v));
    porCliente.set(v.cliente_id, e);
  }
  for (const i of ing as any[]) {
    if (!i.cliente_id) continue;
    const e = porCliente.get(i.cliente_id) || { v: [], i: [] };
    e.i.push(ingresoFromRow(i));
    porCliente.set(i.cliente_id, e);
  }
  // patente_asignada y no patente_uso: esa ultima solo se llena al quemarlo, asi
  // que mirarla dejaba fuera los 1.772 cupones vivos.
  const conCupon = new Set((cup as any[]).map((c) => String(c.patente_asignada || "").toUpperCase()).filter(Boolean));

  const conteo = new Map<number, number>();
  const porAccion = new Map<string, number>();
  const combos = new Map<string, number>();
  const porEtapa = new Map<string, { n: number; suma: number; max: number }>();
  let clientesVivos = 0;

  for (const row of cl as any[]) {
    const cliente = clienteFromRow(row);
    // Solo los que pueden aparecer en el tunel: excluye la ficha muerta que
    // nunca vino y nunca contrato, que no tiene nada que ofrecerle.
    if (!cliente.vencimiento && !(cliente.visitas || 0)) continue;
    clientesVivos++;
    const d = porCliente.get(cliente.id) || { v: [], i: [] };
    const o = calcularOfertasPlan(cliente, d.v, d.i, config, precios, "LOCAL");

    const acciones: string[] = [];
    if (o.renovacionAnticipada) acciones.push("renovar");
    if (o.reactivacion) acciones.push("reactivar");
    if (o.pagoVencido) acciones.push("pagar atrasado");
    if (o.upgrade) acciones.push("upgrade");
    if (o.contratacion) acciones.push("contratar");
    if (conCupon.has(String(cliente.patente).toUpperCase())) acciones.push("cupon");

    for (const a of acciones) porAccion.set(a, (porAccion.get(a) || 0) + 1);
    const n = acciones.length;
    conteo.set(n, (conteo.get(n) || 0) + 1);
    if (n >= 2) combos.set(acciones.join(" + "), (combos.get(acciones.join(" + ")) || 0) + 1);
    const et = ETIQUETA_ETAPA[etapaCliente(cliente)];
    const e = porEtapa.get(et) || { n: 0, suma: 0, max: 0 };
    e.n++;
    e.suma += n;
    e.max = Math.max(e.max, n);
    porEtapa.set(et, e);
  }

  console.log(`Clientes que pueden aparecer en el tunel: ${clientesVivos}\n`);
  console.log("ACCIONES SIMULTANEAS POR CLIENTE");
  const total = [...conteo.values()].reduce((a, b) => a + b, 0);
  for (const n of [...conteo.keys()].sort((a, b) => a - b)) {
    const c = conteo.get(n)!;
    console.log(`  ${n} accion(es): ${String(c).padStart(5)}  ${((c / total) * 100).toFixed(1).padStart(5)}%  ${"#".repeat(Math.round((c / total) * 50))}`);
  }
  const dosOMas = [...conteo.entries()].filter(([n]) => n >= 2).reduce((a, [, c]) => a + c, 0);
  console.log(`\n  CON 2 O MAS: ${dosOMas} (${((dosOMas / total) * 100).toFixed(1)}%)`);

  console.log(`\nCOMBINACIONES MAS FRECUENTES`);
  for (const [k, v] of [...combos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(v).padStart(5)}  ${k}`);

  console.log(`\nPROMEDIO POR ETAPA DEL EMBUDO`);
  for (const [k, v] of [...porEtapa.entries()].sort((a, b) => b[1].suma / b[1].n - a[1].suma / a[1].n))
    console.log(`  ${k.padEnd(24)} ${String(v.n).padStart(5)} clientes  promedio ${(v.suma / v.n).toFixed(2)}  maximo ${v.max}`);
} finally {
  await sql.end();
}
