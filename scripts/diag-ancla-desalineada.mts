// Clientes con plan cuyo vencimiento NO es un borde del ciclo de su ancla
// (`fecha_contratacion`), y clientes a los que un cobro anclado ya les dio un
// periodo corto por esa misma causa. SOLO LECTURA: imprime el SQL, no aplica.
//
// Hasta 7976468 (31-ago-2026) una reactivacion en el meson reiniciaba el ciclo
// desde hoy sin mover `fecha_contratacion`. Con el ancla vieja, el siguiente
// cobro que pasa por vencimientoAnclado (Oneclick: cobrarSuscripcion ->
// aplicarPagoAprobado; Woo: webhooks/woocommerce; Webpay; y "Renovacion Web
// (manual)" desde usePlanActions::renovarWeb) le da al cliente lo que queda
// hasta el proximo aniversario viejo. Caso JBDZ77: contratado 7-jun, reactivado
// en meson 27-jul (venc 26-ago), cobro Oneclick 1-sep -> venc 6-sep. 5 dias por
// un mes pagado; el correcto era 30-sep.
//
// Dos cosas que el codigo impone sobre la definicion ingenua del bug:
//  - El cobro que muerde deja al cliente ALINEADO de nuevo (6-sep ES borde de
//    7-jun) y muchas veces ya VENCIDO (JBDZ77 vencio el 6-sep y pago el 1-sep).
//    Asi que B no se busca entre los desalineados vigentes sino entre todos los
//    que pagaron un mes cuyo ciclo completo (finCicloPlan del pago) sigue vivo.
//  - El meson (renovarPlan) nunca usa el ancla: apila sobre el vencimiento o
//    arranca de hoy. Una "Renovacion atrasada" dentro de la gracia da un periodo
//    corto A PROPOSITO (paga el mes que se salto). No es este bug -> C.
//
// Buckets:
//  A "reinicio sin mover ancla": venc == finCicloPlan(dia de la venta que
//    arranco el ciclo). Todavia no lo mordio ningun cobro; se mueve solo la
//    contratacion. Exacto por construccion.
//  B "periodo corto": la ultima venta de plan paso por vencimientoAnclado, es
//    posterior al ancla y venc - venta < 25 dias. Se mueve contratacion +
//    vencimiento (+ proximo_cobro si hay Oneclick activa).
//     B1: con un reinicio/edicion previa del meson fuera del ciclo (auditoria),
//         o una "Reactivacion promocional (Web|Oneclick)" anclada al ciclo
//         viejo (lo que arreglo reiniciarCiclo) -> este bug, SQL listo.
//     B2: sin ese reinicio -> es la regla web documentada en aplicarPagoAprobado
//         y el webhook Woo ("la vigencia es la contratacion, no el pago, aunque
//         llegue tarde"). SQL comentado: aplicar solo si se decide ser generoso.
//  C "otro": desalineado sin calzar en A/B, con el desfase al borde mas cercano
//    (los Woo con ±1 dia son el drift viejo de vencimientoAnclado, otro tema).
//
// Uso: npx tsx --env-file=.env.local scripts/diag-ancla-desalineada.mts
import postgres from "postgres";
import { anclaCicloPlan, finCicloPlan, sigueVigenteHoy } from "@/lib/helpers/clientes";
import { diaEnSantiago, ymd } from "@/lib/helpers/fechas";
import { TIPOS_VENTA_PLAN } from "@/lib/helpers/ventas";

const MAX_CICLOS = 24;
const DIAS_CORTO = 25;
const MAX_FILAS_TABLA = 40;
const dias = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
const iso = (d: unknown) => (d == null ? null : new Date(d as string).toISOString());
const dia = (isoStr: string) => diaEnSantiago(isoStr)!;
// Un instante Chile-medio-dia para el SQL: independiente de la TZ del proceso
// y lejos de cualquier borde de medianoche/DST. El codigo compara por dia.
const tsChile = (d: string) => `('${d} 12:00'::timestamp at time zone 'America/Santiago')`;
const HOY = ymd(dia(new Date().toISOString()));

type Venta = { cliente_id: string; fecha: string; tipo: string; precio: number; creado_por: string | null };
type Aud = { registro_id: string; creado_en: string; usuario: string | null; nue: string | null };

const canal = (v: Venta) => {
  const cp = v.creado_por ?? "";
  if (/Oneclick/.test(cp) || /\(Oneclick\)$/.test(v.tipo)) return "oneclick";
  if (/^Automático \(Webpay\)/.test(cp)) return "webpay";
  if (/WooCommerce|^Automático \(Web\)/.test(cp) || /\(Web\)$/.test(v.tipo)) return "woo";
  return "mesón";
};
const esUpgrade = (v: Venta) => v.tipo.startsWith("Upgrade");
// Flujos que calculan el vencimiento con vencimientoAnclado (los unicos que
// pueden dar el periodo corto de este bug). El upgrade no cobra un mes: ancla
// el ciclo al Lavado unico que lo origino (aplicarUpgradePlan).
const flujoAnclado = (v: Venta) => !esUpgrade(v) && (canal(v) !== "mesón" || v.tipo === "Renovación Web (manual)");
const fmtVenta = (v?: Venta) => (v ? `${ymd(dia(v.fecha))} ${v.tipo} $${v.precio} · ${v.creado_por ?? "?"}` : "");

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const [{ gracia }] = await sql<{ gracia: number }[]>`select dias_gracia_pago_atrasado as gracia from config limit 1`;
// Margen de 40 dias: un B ya vencido tiene su pago a menos de 25 dias del
// vencimiento y el mes pagado todavia vivo. El filtro fino es en JS.
type ClienteRow = { id: string; patente: string; plan: string | null; vencimiento: string; fecha_contratacion: string; renovacion_auto_woo_desde: string | null };
const clientes = (await sql<ClienteRow[]>`
  select id, patente, plan, vencimiento, fecha_contratacion, renovacion_auto_woo_desde
    from clientes where fecha_contratacion is not null and vencimiento >= now() - interval '40 days'`)
  .map((c) => ({ ...c, vencimiento: iso(c.vencimiento)!, fecha_contratacion: iso(c.fecha_contratacion)! }));
const ids = clientes.map((c) => c.id);

const oneclick = await sql<{ patente: string; proximo_cobro: string | null }[]>`
  select patente, proximo_cobro from suscripciones_oneclick where estado = 'activa'`;
const ocPorPatente = new Map(oneclick.map((s) => [s.patente, iso(s.proximo_cobro)]));

const ventas = (await sql<Venta[]>`
  select cliente_id, fecha, tipo, precio, creado_por from ventas
   where cliente_id = any(${ids}) and not es_servicio_adicional
     and (tipo = any(${[...TIPOS_VENTA_PLAN]}) or tipo = 'Lavado único')
   order by fecha desc`).map((v) => ({ ...v, fecha: iso(v.fecha)!, precio: Number(v.precio) }));
// Solo el meson audita (commit() en AppContext); los cobros server-side
// (Oneclick/Woo/Webpay) no dejan fila. `datos_nuevos` es el patch: si trae
// `vencimiento` distinto del anterior, esa sesion lo cambio.
const auditoria = (await sql<Aud[]>`
  select registro_id, creado_en, usuario, datos_nuevos->>'vencimiento' as nue
    from auditoria
   where tabla = 'clientes' and accion = 'update' and registro_id = any(${ids})
     and datos_nuevos ? 'vencimiento'
     -- como timestamptz, no como texto: el anterior viene en formato Postgres y el
     -- nuevo en ISO de JS, y el mismo instante en dos formatos no es un cambio.
     and (datos_anteriores->>'vencimiento')::timestamptz is distinct from (datos_nuevos->>'vencimiento')::timestamptz
   order by creado_en`).map((a) => ({ ...a, creado_en: iso(a.creado_en)! }));
await sql.end();

const agrupar = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};
const ventasPor = agrupar(ventas, (v) => v.cliente_id);
const audPor = agrupar(auditoria, (a) => a.registro_id);

type Bucket = "A" | "B1" | "B2" | "C";
type Fila = Record<string, unknown> & { bucket: Bucket; sqlCliente?: string; sqlOc?: string; verif: string; cuadraAud: boolean | null };
const filas: Fila[] = [];
let vigentes = 0, desalineados = 0, desalineadosAuto = 0;

for (const c of clientes) {
  const vigente = sigueVigenteHoy(c.vencimiento);
  const ancla = anclaCicloPlan({ fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento })!;
  const vencDia = dia(c.vencimiento);
  const bordes = Array.from({ length: MAX_CICLOS }, (_, i) => finCicloPlan(ancla, i + 1));
  const esBorde = (d: Date | null) => !!d && bordes.some((b) => ymd(b) === ymd(d));
  const alineado = esBorde(vencDia);
  const auto = [ocPorPatente.has(c.patente) && "oneclick", c.renovacion_auto_woo_desde && "woo"].filter(Boolean).join("+") || "no";
  if (vigente) {
    vigentes++;
    if (!alineado) {
      desalineados++;
      if (auto !== "no") desalineadosAuto++;
    }
  }

  const todas = ventasPor.get(c.id) ?? [];
  const planes = todas.filter((v) => TIPOS_VENTA_PLAN.has(v.tipo));
  const [ultima, penultima] = planes;
  // Venta que arranco el ciclo vigente: la ultima de plan, salvo el upgrade,
  // que ancla al Lavado unico anterior (ver aplicarUpgradePlan).
  const arranque = ultima && esUpgrade(ultima) ? todas.find((v) => v.tipo === "Lavado único" && v.fecha < ultima.fecha) : ultima;
  const esA = vigente && !alineado && !!arranque && ymd(finCicloPlan(dia(arranque.fecha))) === ymd(vencDia);

  const diaUltima = ultima ? dia(ultima.fecha) : null;
  const diasPeriodo = diaUltima ? dias(vencDia, diaUltima) : null;
  const vencNuevo = diaUltima ? ymd(finCicloPlan(diaUltima)) : null;
  const corto = !!diaUltima && diaUltima > ancla && diasPeriodo! < DIAS_CORTO && vencNuevo! >= HOY;
  const esB = corto && flujoAnclado(ultima);

  // Evidencia del bug: entre el ancla y la ultima venta, el meson escribio un
  // vencimiento que no es borde del ciclo (reinicio o edicion a mano).
  const auds = audPor.get(c.id) ?? [];
  const reinicio = ultima && auds.find((a) => a.nue && a.creado_en > c.fecha_contratacion && a.creado_en < ultima.fecha && !esBorde(diaEnSantiago(a.nue)));
  // Hermano del bug: una reactivacion web/Oneclick anclada al ciclo viejo. Es lo
  // que 7976468 (reiniciarCiclo) arreglo; diag-reactivaciones-cortas.mts las
  // busca con `fecha < 31-ago` y se le escapan las del mismo 31-ago, previas al
  // deploy. Por el codigo actual, una reactivacion es un mes desde el pago.
  const reactivacion = !!ultima && /^Reactivación promocional \((Web|Oneclick)\)/.test(ultima.tipo);
  const evidencia = reinicio
    ? `auditoría ${ymd(dia(reinicio.creado_en))} (${reinicio.usuario}) → venc ${ymd(dia(reinicio.nue!))}`
    : reactivacion ? "reactivación web/Oneclick anclada al ciclo viejo (pre-7976468)" : "ninguna";

  if (!esB && (!vigente || alineado)) continue;
  const bucket: Bucket = esB ? (reinicio || reactivacion ? "B1" : "B2") : esA ? "A" : "C";

  // Paso 6: ¿el cambio de vencimiento auditado cae el mismo dia que la venta
  // que lo explica? En A es la que arranco el ciclo; en B la ultima es el
  // cobro anclado (sin auditoria), asi que se mira la penultima.
  const diaRef = bucket === "A" ? arranque && dia(arranque.fecha) : penultima ? dia(penultima.fecha) : null;
  const cuadraAud = auds.length && diaRef ? auds.some((a) => ymd(dia(a.creado_en)) === ymd(diaRef)) : null;

  const propContrat = esB ? ultima.fecha : esA ? arranque!.fecha : null;
  const propVenc = esB ? vencNuevo : null;
  const proxCobro = ocPorPatente.get(c.patente) ?? null;
  const desfase = bordes.map((b) => dias(vencDia, b)).sort((x, y) => Math.abs(x) - Math.abs(y))[0];
  const guard = `where id = '${c.id}' and vencimiento = '${c.vencimiento}'`;
  filas.push({
    bucket,
    patente: c.patente,
    plan: c.plan,
    venc: ymd(vencDia) + (vigente ? "" : " (vencido)"),
    contrat: ymd(ancla),
    ultima: fmtVenta(ultima),
    penultima: fmtVenta(penultima),
    dias: diasPeriodo,
    propVenc: propVenc ?? (esA ? "=" : ""),
    propContrat: propContrat ? ymd(dia(propContrat)) : "",
    auto,
    evidencia: bucket === "A" ? "por construcción" : evidencia,
    proxCobro: proxCobro ? ymd(dia(proxCobro)) : "",
    propProxCobro: esB && proxCobro ? propVenc : "",
    motivo: bucket === "C"
      ? corto ? `período corto por venta de mesón (gracia ${gracia} días: regla mesón)` : `venc a ${desfase} día(s) del borde más cercano`
      : "",
    cuadraAud,
    verif: `('${c.id}', '${c.vencimiento}'::timestamptz)`,
    sqlCliente: esB
      ? `update clientes set fecha_contratacion = '${propContrat}', vencimiento = ${tsChile(propVenc!)} ${guard}; -- ${c.patente}: venc ${ymd(vencDia)} → ${propVenc}`
      : esA ? `update clientes set fecha_contratacion = '${propContrat}' ${guard}; -- ${c.patente}` : undefined,
    sqlOc: esB && proxCobro
      ? `update suscripciones_oneclick set proximo_cobro = ${tsChile(propVenc!)}, actualizado_en = now() where patente = '${c.patente}' and estado = 'activa'; -- ${ymd(dia(proxCobro))} → ${propVenc}`
      : undefined,
  });
}

const por = (...bs: Bucket[]) => filas.filter((f) => bs.includes(f.bucket));
const A = por("A"), B1 = por("B1"), B2 = por("B2"), C = por("C");
const COLS = ["patente", "plan", "venc", "contrat", "ultima", "penultima", "dias", "propVenc", "propContrat", "auto", "evidencia", "proxCobro", "propProxCobro", "motivo", "cuadraAud"];
const tabla = (nombre: string, xs: Fila[]) => {
  console.log(`\n== ${nombre}: ${xs.length} ==`);
  if (!xs.length) return;
  const vista = xs.length > MAX_FILAS_TABLA ? xs.slice(0, 15) : xs;
  console.table(vista.map((f) => Object.fromEntries(COLS.filter((k) => f[k] !== "" && f[k] != null).map((k) => [k, f[k]]))));
  if (vista.length < xs.length) console.log(`   (primeras ${vista.length} de ${xs.length})`);
};
const conAuto = (xs: Fila[], q: string) => xs.filter((f) => String(f.auto).includes(q)).length;

console.log(`hoy (Chile): ${HOY} · gracia pago atrasado: ${gracia} días · umbral período corto: <${DIAS_CORTO} días`);
console.log(`vigentes con fecha_contratacion: ${vigentes}`);
console.log(`DESALINEADOS vigentes (venc no es borde del ancla, k=1..${MAX_CICLOS}): ${desalineados} · con cobro automático: ${desalineadosAuto}`);
console.log(`buckets → A: ${A.length} · B1: ${B1.length} (oneclick ${conAuto(B1, "oneclick")}, woo ${conAuto(B1, "woo")}) · B2: ${B2.length} (oneclick ${conAuto(B2, "oneclick")}, woo ${conAuto(B2, "woo")}) · C: ${C.length}`);

tabla("A · reinicio sin mover ancla (solo fecha_contratacion)", A);
tabla("B1 · período corto tras reinicio/edición del mesón fuera del ciclo (contratación + vencimiento + proximo_cobro)", B1);
tabla("B2 · período corto SIN reinicio previo: regla web del código (vigencia por contratación), opcional", B2);
tabla("C · otro, revisar a mano", C);
const drift = C.filter((f) => /a -?1 día/.test(String(f.motivo)));
console.log(`   C con venc a ±1 día del borde (drift viejo de vencimientoAnclado, otro tema): ${drift.length} (woo: ${conAuto(drift, "woo")}, oneclick: ${conAuto(drift, "oneclick")}) · resto: ${C.length - drift.length}`);

const pct = (xs: Fila[]) => {
  const conAud = xs.filter((f) => f.cuadraAud !== null);
  const ok = conAud.filter((f) => f.cuadraAud).length;
  return `${ok}/${conAud.length} cuadran (${conAud.length ? Math.round((100 * ok) / conAud.length) : 0}%) · sin auditoría: ${xs.length - conAud.length}`;
};
console.log(`\n== Validación con auditoría (solo escribe el mesón; el log arranca 12-jul-2026) ==`);
console.log(`A  (cambio auditado el día de la venta que arrancó el ciclo): ${pct(A)}`);
console.log(`B1 (cambio auditado el día de la penúltima venta):           ${pct(B1)}`);
console.log(`B2 (ídem):                                                   ${pct(B2)}`);

const j = filas.find((f) => f.patente === "JBDZ77");
const okJ = j?.bucket === "B1" && j.propVenc === "2026-09-30" && j.propContrat === "2026-09-01";
console.log(`\ncheck JBDZ77: ${okJ ? "OK" : "FALLA"} → ${j ? `bucket ${j.bucket}, venc ${j.venc}, propVenc ${j.propVenc}, propContrat ${j.propContrat}, proxCobro ${j.proxCobro} → ${j.propProxCobro}` : "no aparece"}`);

const fix = [...A, ...B1];
console.log(`\n-- ===== SQL PROPUESTO — NO ejecutar desde acá (q.mts es solo-lectura). Pegar en el SQL Editor de Supabase. =====`);
console.log(`-- Cada UPDATE exige el vencimiento actual exacto: si el cliente renovó entre este diagnóstico y el pegado,`);
console.log(`-- no lo toca (0 filas). Idempotente: una segunda corrida deja los mismos valores o no matchea.`);
console.log(`-- proximo_cobro queda IGUAL al vencimiento nuevo (convención del código: oneclick/cobrar/route.ts:87,`);
console.log(`-- cobrarOfertaOneclick.ts:201, inscripcion/retorno), no al día siguiente: el cron cobra ese día con el`);
console.log(`-- plan aún vigente y apila un mes desde el vencimiento.`);
console.log(`\n-- 0) verificar: debe devolver ${fix.length} fila(s) (A + B1)`);
if (fix.length) console.log(`select patente, vencimiento, fecha_contratacion from clientes where (id, vencimiento) in (values\n  ${fix.map((f) => f.verif).join(",\n  ")});`);
console.log(`\n-- A) reinicio sin mover ancla: ${A.length} fila(s)`);
for (const f of A) console.log(f.sqlCliente);
console.log(`\n-- B1) período corto: ${B1.length} fila(s)`);
for (const f of B1) console.log(f.sqlCliente);
const oc = B1.filter((f) => f.sqlOc);
console.log(`\n-- B1-oneclick) proximo_cobro: ${oc.length} fila(s). Verificar antes:`);
if (oc.length) console.log(`select patente, proximo_cobro from suscripciones_oneclick where estado = 'activa' and patente in (${oc.map((f) => `'${f.patente}'`).join(", ")});`);
for (const f of oc) console.log(f.sqlOc);
if (B2.length) {
  console.log(`\n-- B2) OPCIONAL, ${B2.length} fila(s): el código ancla a propósito (regla web). Descomentar solo si se decide ser generoso.`);
  console.log(`/*`);
  for (const f of B2) console.log(f.sqlCliente);
  for (const f of B2) if (f.sqlOc) console.log(f.sqlOc);
  console.log(`*/`);
}
