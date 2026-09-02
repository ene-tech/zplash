// Reporte SOLO LECTURA de que suscripciones de WooCommerce hay que dar de baja
// antes de destrabar el staging site lock, y por que motivo. La logica vive en
// ./wooLimpieza.mts, compartida con el script que ejecuta las bajas.
//
// Veredictos que se cancelan:
//   TOPE          -> ilimitado legacy con 6+ pasadas en el ciclo en curso
//                    (superoTopeIlimitado: le corresponde el corte + oferta X5)
//   MIGRADO       -> ya tiene Oneclick propio activo: cobrar por Woo es doble
//   RENOVO LOCAL  -> plan vigente pagado por otro canal (meson/Web/Webpay)
//   MUY VENCIDO   -> vencido hace mas de DIAS_GRACIA dias: no corresponde
//                    cobrarle una renovacion retroactiva de un mes que no tuvo
//   DUPLICADA     -> la patente tiene 2+ suscripciones vivas: se cobraria dos
//                    veces, se bajan las dos y se revisa a mano
// Se mantiene:
//   MANTENER      -> vigente (o vencido hace <=DIAS_GRACIA) y fuera de lo de
//                    arriba: se le sigue cobrando por Woo
//
// OJO con suscripcion_cancelada_en: NO sirve para detectar "el cliente
// cancelo". El 31-ago se cancelaron 322 suscripciones en Woo y se reactivaron
// 88; la columna solo se limpia cuando llega un pedido nuevo (ver el comentario
// del campo en @/db/schema/clientes), y el site lock impide que lleguen. Una
// suscripcion VIVA en Woo con esa marca puesta es, por construccion, una
// reactivada: quien cancelo de verdad ya esta "cancelled" alla y no sale aca.
//
// Uso: npx tsx --env-file=.env.local scripts/diag-woo-limpieza.mts
//      npx tsx --env-file=.env.local scripts/diag-woo-limpieza.mts --csv > limpieza.csv
import { ORDEN, clasificar } from "./wooLimpieza";

const csv = process.argv.includes("--csv");
const filas = await clasificar();

if (csv) {

  console.log("veredicto,motivo,subId,subEstado,monto,proximoCobro,patente,nombre,email,telefono,plan,vencimiento,pasadas");
  for (const f of filas) console.log([f.v, f.motivo, f.s.id, f.s.estado, f.s.monto, f.s.prox, f.s.patente || f.c?.patente || "",
    f.c?.nombre || "", f.s.email, f.c?.telefono || "", f.c?.plan || "", f.venc, f.pasadas].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
} else {
  const orden = ["TOPE", "MIGRADO", "RENOVO LOCAL", "MUY VENCIDO", "DUPLICADA", "SIN FICHA", "MANTENER"];
  const plata = (fs: typeof filas) => "$" + fs.reduce((a, f) => a + f.s.monto, 0).toLocaleString("es-CL");
  console.log(`Suscripciones vivas en Woo: ${filas.length}  ${plata(filas)}/mes\n`);
  for (const v of orden) {
    const g = filas.filter((f) => f.v === v);
    if (!g.length) continue;
    console.log(`${v.padEnd(13)} ${String(g.length).padStart(4)}  ${plata(g)}/mes`);
  }
  for (const v of orden) {
    const g = filas.filter((f) => f.v === v).sort((a, b) => Number(b.pasadas) - Number(a.pasadas));
    if (!g.length || v === "MANTENER") continue;
    console.log(`\n== ${v} (${g.length}) ==`);
    for (const f of g) console.log(`  #${f.s.id} ${f.s.estado.padEnd(7)} $${String(f.s.monto).padStart(5)} cobra ${f.s.prox || "-"} | ${(f.s.patente || f.c?.patente || "?").padEnd(7)} ${String(f.c?.nombre || f.s.email).slice(0, 28).padEnd(28)} | vence ${f.venc || "-"} | ${f.motivo}`);
  }
  const mant = filas.filter((f) => f.v === "MANTENER");
  console.log(`\n== MANTENER Y COBRAR (${mant.length}) ==`);
  for (const f of mant.sort((a, b) => String(a.s.prox).localeCompare(String(b.s.prox))))
    console.log(`  #${f.s.id} ${f.s.estado.padEnd(7)} $${String(f.s.monto).padStart(5)} cobra ${f.s.prox || "-"} | ${(f.s.patente || f.c?.patente || "?").padEnd(7)} ${String(f.c?.nombre || f.s.email).slice(0, 28).padEnd(28)} | vence ${f.venc || "-"} | ${f.motivo}`);
  const dup = Object.entries(
    filas.reduce<Record<string, typeof filas>>((a, f) => {
      const k = f.s.patente || f.c?.patente || "?";
      (a[k] ||= [] as unknown as typeof filas).push(f);
      return a;
    }, {})
  ).filter(([, g]) => g.length > 1);
  if (dup.length) {
    console.log(`\n== PATENTES CON MAS DE UNA SUSCRIPCION VIVA (${dup.length}) — doble cobro aunque se limpie el resto ==`);
    for (const [pat, g] of dup) console.log(`  ${pat}: ${g.map((f) => `#${f.s.id}(${f.v}, $${f.s.monto}, cobra ${f.s.prox || "-"})`).join("  ")}`);
  }
}
