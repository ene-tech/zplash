// Radiografía de UN cliente: qué le ve el mesón hoy y por qué. SOLO LECTURA
// (misma garantía que q.mts: corre dentro de una transacción `read only`, así
// que la escritura la rechaza Postgres y no un regex sobre el texto).
//
// Nace del caso RBBP85 ("renovó el 21-ago, debería tener plan vigente y
// pasadas de túnel disponibles"): esa respuesta vive repartida entre
// `clientes` (vencimiento y ancla del ciclo), `ventas` (qué pagó y cuándo) e
// `ingresos` (qué gastó dentro de la ventana), y cruzarlas a mano en el SQL
// Editor es donde se va el rato. Acá salen las tres y, sobre todo, el
// DIAGNÓSTICO: los modos de falla ya vistos en producción —ciclo corto por
// reactivación web, ancla deducida, ventana corrida, ficha guardada encima del
// pago— evaluados contra esta ficha.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-cliente.mts RBBP85
import postgres from "postgres";
import { anclaCicloPlan, finCicloPlan, periodoPlan, planStatus, sigueVigenteHoy } from "@/lib/helpers/clientes";
import { ahoraEnSantiago, diaEnSantiago } from "@/lib/helpers/fechas";
import { pasesIncluidos, planVigente } from "@/lib/helpers/precios";
import { normPlate } from "@/lib/helpers/validadores";
import { TIPOS_VENTA_PLAN } from "@/lib/helpers/ventas";

const patente = normPlate(process.argv[2]);
if (!patente) {
  console.error("Falta la patente. Ej: npx tsx --env-file=.env.local scripts/diag-cliente.mts RBBP85");
  process.exit(1);
}

/** Commit 7976468 (31-ago-2026): hasta ahí, la reactivación web/Oneclick de un
 * plan vencido apilaba un mes sobre el vencimiento viejo en vez de arrancar el
 * ciclo desde el pago. Ver scripts/diag-reactivaciones-cortas.mts. */
const FIX_REINICIAR_CICLO = new Date("2026-08-31T00:00:00-04:00");
/** Ventas que, por diseño, arrancan el ciclo DESDE EL PAGO cuando el cliente
 * está vencido: la reactivación se vende como "un mes completo desde hoy" (ver
 * renovarPlan sin `anclarAtraso` y `reiniciarCiclo` en aplicarPagoAprobado), y
 * un plan nuevo no tiene ciclo viejo al que anclarse. Todo el resto —el pago
 * atrasado dentro del plazo de gracia, la renovación web/WooCommerce de un
 * vencido— conserva el aniversario a propósito, así que entrega MENOS de un mes
 * sin que eso sea un error. Sin esta distinción el diagnóstico marca como bug
 * lo que el negocio pidió. */
const TIPOS_QUE_REINICIAN = new Set([
  "Plan nuevo",
  "Plan nuevo (Web)",
  "Reactivación promocional",
  "Reactivación promocional (Web)",
  "Reactivación promocional (Oneclick)",
]);

const DIA = 24 * 3600 * 1000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dias = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DIA);
const dia = (v: string | null) => (v ? diaEnSantiago(v) : null);
const fmt = (v: string | null) => {
  const d = dia(v);
  return d ? ymd(d) : "-";
};
/** ¿Cae el último día de su mes? Único caso en que deducir el ancla del
 * vencimiento es ambiguo (ver anclaCicloPlan y scripts/diag-ancla-ciclo.mts). */
const esUltimoDiaDelMes = (d: Date) => new Date(d.getTime() + DIA).getMonth() !== d.getMonth();
// timestamptz vuelve como Date desde postgres.js; los helpers esperan el ISO.
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : ((v as string | null) ?? null));

type FilaCliente = Record<string, unknown>;
type FilaVenta = { cliente_id: string; fecha: Date; tipo: string; precio: number; creado_por: string | null; metodo_pago: string | null };
type FilaIngreso = { cliente_id: string; fecha: Date; plan_estado_al_ingreso: string; es_garantia: boolean; creado_por: string | null };

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const PAT = sql`upper(regexp_replace(patente, '[^A-Za-z0-9]', '', 'g'))`;

try {
  const { clientes, ventas, ingresos } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    // Se busca también por `patente_pendiente` y por la patente de ventas e
    // ingresos: un cambio de patente deja las filas viejas con la anterior
    // (ver resolverPatentePendiente), y preguntar por cualquiera de las dos
    // tiene que llegar a la misma ficha.
    const clientes = await tx<FilaCliente[]>`
      select id, nombre, patente, plan, vencimiento, fecha_contratacion, ilimitado_hasta, ultima_renovacion,
             origen, renovacion_auto_woo_desde, patente_pendiente, suscripcion_cancelada_en, creado_en
        from clientes
       where ${PAT} = ${patente}
          or upper(regexp_replace(coalesce(patente_pendiente, ''), '[^A-Za-z0-9]', '', 'g')) = ${patente}
          or id in (select cliente_id from ventas where ${PAT} = ${patente})
          or id in (select cliente_id from ingresos where ${PAT} = ${patente})`;
    const ids = clientes.map((c) => c.id as string);
    if (!ids.length) return { clientes, ventas: [] as FilaVenta[], ingresos: [] as FilaIngreso[] };
    const ventas = await tx<FilaVenta[]>`
      select cliente_id, fecha, tipo, precio, creado_por, metodo_pago
        from ventas where cliente_id in ${tx(ids)} order by fecha`;
    const ingresos = await tx<FilaIngreso[]>`
      select cliente_id, fecha, plan_estado_al_ingreso, es_garantia, creado_por
        from ingresos where cliente_id in ${tx(ids)} order by fecha`;
    return { clientes, ventas, ingresos };
  });

  if (!clientes.length) {
    console.log(`No hay ficha, venta ni ingreso con la patente ${patente}.`);
    process.exit(0);
  }
  if (clientes.length > 1) console.log(`OJO: ${clientes.length} fichas resuelven a ${patente} (¿cambio de patente a medias?). Se diagnostican todas.`);

  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);

  for (const c of clientes) {
    const cli = {
      id: c.id as string,
      // `Cliente.plan` es opcional, no nullable: la columna en null se traduce a undefined.
      plan: (c.plan as string | null) ?? undefined,
      ilimitadoHasta: iso(c.ilimitado_hasta),
      fechaContratacion: iso(c.fecha_contratacion),
      vencimiento: iso(c.vencimiento),
    };
    const misVentas = ventas.filter((v) => v.cliente_id === cli.id);
    const misIngresos = ingresos.filter((i) => i.cliente_id === cli.id);

    console.log(`\n================ ${c.patente} · ${c.nombre} ================`);
    console.table([
      {
        plan: cli.plan ?? "(sin plan)",
        vencimiento: fmt(cli.vencimiento),
        contratacion: cli.fechaContratacion ? fmt(cli.fechaContratacion) : "(null · se deduce)",
        ilimitadoHasta: fmt(cli.ilimitadoHasta),
        ultimaRenovacion: fmt(iso(c.ultima_renovacion)),
        origen: c.origen,
        renovAutoWoo: fmt(iso(c.renovacion_auto_woo_desde)),
        patentePendiente: (c.patente_pendiente as string | null) ?? "-",
      },
    ]);

    // ---- Lo que ve el mesón hoy: mismas funciones que useOperadorFoundResult ----
    const estado = planStatus(cli);
    const plan = planVigente(cli);
    const incluidos = pasesIncluidos(plan);
    const ventana = periodoPlan(cli);
    // La comparación va por DÍA chileno y no por instante crudo: `ventana` sale
    // de periodoPlan, cuyos bordes son medianoches del calendario de Chile, y
    // este script se corre tanto desde un laptop en Chile como desde un
    // contenedor en UTC. Comparando instantes, un ingreso entre las 20:00 y las
    // 24:00 de Chile cae al ciclo equivocado según dónde corra.
    const enVentana = (f: Date) => {
      const d = diaEnSantiago(f.toISOString());
      return !!d && d >= ventana.inicio && d < ventana.fin;
    };
    const usados = misIngresos.filter((i) => enVentana(i.fecha)).length;
    const restantes = incluidos === null ? null : Math.max(0, incluidos - usados);
    const ancla = anclaCicloPlan(cli);
    console.log("\n-- Hoy en el mesón --");
    console.table([
      {
        estado: estado.label,
        planQueRige: plan || "(sin plan)",
        incluidas: incluidos ?? "sin tope",
        ventanaDePases: `${ymd(ventana.inicio)} → ${ymd(ventana.fin)} (fin excluido)`,
        usadasEnLaVentana: usados,
        // Con el plan vencido no hay pasada incluida que gastar: el mesón le
        // cobra lavado único (ver planVigente/estadoIngreso en
        // useOperadorFoundResult), así que mostrar "le quedan 5" sería mentira.
        pasadasQueLeQuedan: estado.cls === "bad" ? "0 (plan vencido)" : (restantes ?? "sin tope"),
        ancla: ancla ? `${ymd(ancla)}${cli.fechaContratacion ? "" : " (deducida del vencimiento)"}` : "-",
      },
    ]);

    // ---- Ventas de plan: qué compró y qué vencimiento le correspondía ----
    const ventasPlan = misVentas.filter((v) => TIPOS_VENTA_PLAN.has(v.tipo));
    console.log(`\n-- Ventas de plan (${ventasPlan.length}) --`);
    console.table(
      ventasPlan.map((v) => {
        const pago = diaEnSantiago(v.fecha.toISOString())!;
        return {
          fecha: ymd(pago),
          tipo: v.tipo,
          precio: Number(v.precio),
          creadoPor: v.creado_por ?? "-",
          metodo: v.metodo_pago ?? "-",
          // Un mes completo contado desde el pago: lo que le toca cuando el
          // ciclo REINICIA (plan vencido). Renovando vigente el vencimiento se
          // apila y queda más allá de esta fecha, nunca más acá.
          mesCompletoHasta: ymd(finCicloPlan(pago)),
        };
      })
    );

    // ---- Ingresos dentro y alrededor de la ventana ----
    const recientes = misIngresos.filter((i) => new Date(i.fecha) >= new Date(hoy.getTime() - 75 * DIA));
    console.log(`\n-- Ingresos de los últimos 75 días (${recientes.length}) --`);
    console.table(
      recientes.map((i) => ({
        fecha: ymd(diaEnSantiago(i.fecha.toISOString())!),
        enLaVentana: enVentana(i.fecha) ? "SÍ (descuenta)" : "no",
        estadoAlIngreso: i.plan_estado_al_ingreso,
        garantia: i.es_garantia ? "sí" : "",
        creadoPor: i.creado_por ?? "-",
      }))
    );

    // ---- Diagnóstico: los modos de falla conocidos, contra esta ficha ----
    const hallazgos: string[] = [];
    const ultima = ventasPlan.at(-1);
    const venc = dia(cli.vencimiento);

    if (ultima && venc) {
      const pago = diaEnSantiago(ultima.fecha.toISOString())!;
      const mesCompleto = finCicloPlan(pago);
      const faltan = dias(mesCompleto, venc);
      // Un ciclo más corto que un mes NO es de por sí un error: solo lo es
      // cuando la venta era de las que arrancan el ciclo desde el pago (ver
      // TIPOS_QUE_REINICIAN). Una renovación anclada entrega menos días a
      // propósito.
      const reinicia = TIPOS_QUE_REINICIAN.has(ultima.tipo);
      if (faltan > 0 && reinicia) {
        const esReactivacionWeb = ["Reactivación promocional (Web)", "Reactivación promocional (Oneclick)"].includes(ultima.tipo);
        hallazgos.push(
          `CICLO CORTO: pagó el ${ymd(pago)} ("${ultima.tipo}", que se vende como un mes completo desde el pago) y quedó vencido el ` +
            `${ymd(venc)} en vez del ${ymd(mesCompleto)} — le faltan ${faltan} día(s).` +
            (esReactivacionWeb && ultima.fecha < FIX_REINICIAR_CICLO
              ? ` Es el bug de \`reiniciarCiclo\` (commit 7976468, 31-ago-2026): la reactivación web/Oneclick apilaba el mes sobre el vencimiento ` +
                `YA VENCIDO en vez de arrancar el ciclo desde el pago. scripts/diag-reactivaciones-cortas.mts emite el UPDATE que lo corrige.`
              : ` Revisar si alguien guardó la ficha encima del pago (el vencimiento tipeado a mano pisa el calculado, caso CKLW93 / commit 389cdad).`)
        );
      } else if (faltan > 0) {
        hallazgos.push(
          `CICLO ANCLADO: pagó el ${ymd(pago)} ("${ultima.tipo}") y quedó vencido el ${ymd(venc)}, ${faltan} día(s) antes de un mes completo ` +
            `desde el pago. Es lo ESPERADO en una renovación que conserva el aniversario —pago atrasado dentro del plazo de gracia ` +
            `(anclarAtraso en renovarPlan), renovación web/WooCommerce de un vencido (vencimientoAnclado)—: el cliente paga el mes que debía, ` +
            `no uno nuevo desde hoy. Solo es un problema si lo que se le vendió fue "un mes desde hoy".`
        );
      }
      // Vencido HOY estando dentro del mes que ese pago debía cubrir. Acotado
      // así y no a "pagó hace menos de X días": un plan que caducó a los 30
      // días de su pago simplemente se venció, y reportarlo sería ruido.
      if (!sigueVigenteHoy(cli.vencimiento) && hoy <= mesCompleto)
        hallazgos.push(
          `VENCIDO DENTRO DEL MES QUE PAGÓ: la última venta de plan es del ${ymd(pago)} y la ficha marca vencido el ${ymd(venc)}; hoy todavía ` +
            `cae dentro del mes que ese pago debía cubrir (hasta el ${ymd(mesCompleto)}). En el mesón eso es lavado único y cero pasadas incluidas.` +
            (reinicia ? "" : ` Si la venta era anclada, revisar contra qué vencimiento se ancló antes de tocar nada.`)
        );
      // La ventana de pases tiene que ser el mes que pagó, pero solo cuando ese
      // pago reinició el ciclo: renovar ANTES de vencer apila sobre el ciclo en
      // curso y ahí la ventana arranca legítimamente antes del pago.
      if (reinicia && sigueVigenteHoy(cli.vencimiento) && ventana.inicio < pago) {
        const previas = misIngresos.filter((i) => {
          const d = diaEnSantiago(i.fecha.toISOString());
          return !!d && d >= ventana.inicio && d < pago;
        }).length;
        if (previas > 0)
          hallazgos.push(
            `VENTANA CORRIDA: el pago del ${ymd(pago)} ("${ultima.tipo}") arranca un ciclo nuevo, pero la ventana de pases empieza el ` +
              `${ymd(ventana.inicio)} y le descuenta ${previas} pasada(s) anteriores a esa compra.`
          );
      }
    }

    // El dedup del webhook de WooCommerce registra la venta pero NO mueve el
    // vencimiento (ver route.ts): si el pedido no era un eco, el cliente pagó
    // y su plan no avanzó ni un día.
    const marcadaDuplicada = ventasPlan.filter((v) => (v.creado_por ?? "").includes("posible duplicado"));
    if (marcadaDuplicada.length)
      hallazgos.push(
        `VENTA MARCADA COMO POSIBLE DUPLICADO (${marcadaDuplicada.map((v) => ymd(diaEnSantiago(v.fecha.toISOString())!)).join(", ")}): ` +
          `el webhook de WooCommerce la dio por eco de otro cobro y dejó el vencimiento donde estaba. Si el pago era real, hay que extender el mes a mano.`
      );

    if (!cli.fechaContratacion && cli.plan)
      hallazgos.push(
        `SIN ANCLA GUARDADA: \`fecha_contratacion\` en null, así que la ventana de pases se DEDUCE del vencimiento (+1 día).` +
          (venc && esUltimoDiaDelMes(venc)
            ? ` Y el vencimiento cae el último día de su mes: es el caso ambiguo (HYRL56) donde la deducción puede quedar un mes corrida. Ver scripts/diag-ancla-ciclo.mts.`
            : ` El vencimiento no cae a fin de mes, así que la deducción es exacta: no es la causa acá.`)
      );

    if (incluidos !== null && restantes === 0 && estado.cls !== "bad")
      hallazgos.push(
        `SIN PASES CON PLAN VIGENTE: gastó las ${incluidos} pasadas de la ventana ${ymd(ventana.inicio)} → ${ymd(ventana.fin)}. ` +
          `Se le reponen el ${ymd(ventana.fin)}; hasta entonces el mesón le cobra lavado adicional.`
      );

    if (cli.ilimitadoHasta && sigueVigenteHoy(cli.ilimitadoHasta))
      hallazgos.push(`Arrastra el ilimitado viejo hasta el ${fmt(cli.ilimitadoHasta)}: hasta esa fecha NO tiene tope de pasadas.`);

    console.log("\n-- Diagnóstico --");
    if (!hallazgos.length) console.log("Nada anómalo: el vencimiento y la ventana de pases calzan con lo que pagó.");
    else hallazgos.forEach((h, i) => console.log(`${i + 1}. ${h}\n`));
  }
} finally {
  await sql.end();
}
