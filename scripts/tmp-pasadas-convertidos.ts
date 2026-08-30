import postgres from "postgres";

// Historial de pasadas de los clientes que venian del Plan Ilimitado Mensual y
// fueron convertidos a Plan X5 por un cobro automatico de Oneclick (sin que
// hicieran click en nada). Identificados asi: tienen ventas viejas con
// plan = 'Plan Ilimitado Mensual' y una venta (Oneclick) con plan = 'Plan X5'
// -- aplicarPagoAprobado graba la venta con PLANES[0], que es X5.
//
// Los ciclos se cuentan hacia atras desde el vencimiento vigente, un mes por
// vez (mismo criterio anclado que finCicloPlan/periodoPlan).

const TOPE_X5 = 5;

function mesesAtras(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - n);
  return r;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

  const convertidos = await sql`
    select c.id, c.patente, c.nombre, c.plan, c.vencimiento,
           c.ilimitado_hasta, c.precio_plan_heredado as heredado,
           oc.fecha as fecha_conversion, oc.precio as precio_conversion, oc.tipo as tipo_conversion
    from clientes c
    join lateral (
      select v.fecha, v.precio, v.tipo from ventas v
      where v.cliente_id = c.id and v.tipo ilike '%(Oneclick)' and v.plan = 'Plan X5'
      order by v.fecha asc limit 1
    ) oc on true
    where exists (
      select 1 from ventas v2
      where v2.cliente_id = c.id and v2.plan = 'Plan Ilimitado Mensual' and v2.fecha < oc.fecha
    )
    order by oc.fecha desc`;

  console.log(`CLIENTES CONVERTIDOS DE ILIMITADO A X5 POR COBRO AUTOMATICO: ${convertidos.length}\n`);

  const ingresos = await sql`
    select i.cliente_id, i.fecha from ingresos i
    where i.cliente_id in ${sql(convertidos.map((c) => c.id as string))}
    order by i.fecha desc`;

  const porCliente = new Map<string, Date[]>();
  for (const i of ingresos) {
    const arr = porCliente.get(i.cliente_id as string) || [];
    arr.push(new Date(i.fecha as string));
    porCliente.set(i.cliente_id as string, arr);
  }

  const resumen: { patente: string; nombre: string; cicloActual: number; excede: boolean }[] = [];

  for (const c of convertidos) {
    const fechas = porCliente.get(c.id as string) || [];
    const venc = new Date(c.vencimiento as string);
    const conv = new Date(c.fecha_conversion as string);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    console.log(`── ${c.patente}  ${c.nombre}`);
    console.log(
      `   convertido el ${fmt(conv)} por "${c.tipo_conversion}" $${c.precio_conversion}  ·  plan ahora: ${c.plan}  ·  ilimitadoHasta: ${c.ilimitado_hasta ? fmt(new Date(c.ilimitado_hasta as string)) : "null"}  ·  vence ${fmt(venc)}`
    );
    console.log(`   pasadas totales en el sistema: ${fechas.length}`);

    // Ciclos hacia atras desde el vencimiento, 6 meses.
    for (let k = 0; k < 6; k++) {
      const fin = mesesAtras(venc, k);
      const inicio = mesesAtras(venc, k + 1);
      const delCiclo = fechas.filter((f) => f > inicio && f <= fin);
      if (!delCiclo.length && k > 2) continue;
      const post = fin >= conv;
      const excede = post && delCiclo.length > TOPE_X5;
      const marca = excede ? `  <-- ${delCiclo.length} pasadas, el X5 da ${TOPE_X5}` : "";
      console.log(
        `     ${fmt(inicio)} → ${fmt(fin)}  ${String(delCiclo.length).padStart(2)} pasada(s)${post ? " [ya en X5]" : ""}${marca}`
      );
      if (delCiclo.length) console.log(`        ${delCiclo.map(fmt).reverse().join("  ")}`);
      if (k === 0) resumen.push({ patente: c.patente as string, nombre: c.nombre as string, cicloActual: delCiclo.length, excede });
    }
    console.log("");
  }

  console.log("\n== RESUMEN: ciclo vigente (el que ya corre bajo X5) ==");
  for (const r of resumen.sort((a, b) => b.cicloActual - a.cicloActual)) {
    console.log(`  ${r.patente.padEnd(7)} ${r.nombre.slice(0, 30).padEnd(30)} ${String(r.cicloActual).padStart(2)} pasadas${r.excede ? "   EXCEDE EL X5" : ""}`);
  }

  await sql.end();
}
main();
