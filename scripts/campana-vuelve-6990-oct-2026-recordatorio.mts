// Recordatorio "últimos días" de la campaña Vuelve por $6.990 (ver
// scripts/campana-vuelve-6990-oct-2026.mts). Pensado para el 28/29-oct.
//
// A quién: los que recibieron el SMS de la campaña y todavía no usaron el
// cupón, partidos en dos mitades por el último dígito de la patente:
//   impar (1,3,5,7,9) → reciben el recordatorio
//   par   (2,4,6,8)   → no lo reciben (control del segundo toque)
// (las terminadas en 0 ya eran el control de la campaña). Así se mide cuánto
// suma el recordatorio sobre el primer SMS, por tramo.
//
// No crea cupones: el de la campaña sigue vigente hasta el 31-oct. Cada tramo
// sale como campaña SMS aparte (vuelve-6990-oct-2026-recordatorio-dXX) y la
// partición queda en scripts/campana-vuelve-6990-oct-2026-recordatorio.json.
//
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-vuelve-6990-oct-2026-recordatorio.mts
//     Simulacro: conteos y texto; no escribe ni envía nada.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-vuelve-6990-oct-2026-recordatorio.mts --enviar
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { enviarMensajesMasivosSms } from "@/lib/sms/masivo";
import { segmentosSms, textoFinalSms } from "@/lib/sms/texto";

const CAMPANA = "vuelve-6990-oct-2026-recordatorio";
const ARCHIVO = `scripts/campana-${CAMPANA}.json`;
const TEXTO_SMS = `Zplash: Quedan pocos dias! Tu lavado a $6.990 (normal $9.990) vence el 31/10. Ya esta cargado a tu patente {{patente}}.`;

type Fila = { id: string; patente: string; tramo: string; sms: boolean; control: boolean };

const enviar = process.argv.includes("--enviar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const campana: Fila[] = JSON.parse(readFileSync("scripts/campana-vuelve-6990-oct-2026.json", "utf8")).filas;
  const usados = new Set(
    (await sql<{ p: string }[]>`select patente_asignada p from cupones where nombre_lote like 'SMS masivo - vuelve-6990-oct-2026-%' and usado`).map((r) => r.p)
  );
  const pendientes = campana.filter((f) => f.sms && !f.control && !usados.has(f.patente));
  const recibe = (patente: string) => /[13579]$/.test(patente);
  const filas = pendientes.map((f) => ({ id: f.id, patente: f.patente, tramo: f.tramo, recordatorio: recibe(f.patente) }));

  const tramos = [...new Set(filas.map((f) => f.tramo))].sort();
  console.table(
    tramos.map((t) => ({
      tramo: t,
      recordatorio: filas.filter((f) => f.tramo === t && f.recordatorio).length,
      sinRecordatorio: filas.filter((f) => f.tramo === t && !f.recordatorio).length,
    }))
  );
  const ejemplo = textoFinalSms(TEXTO_SMS.replace("{{patente}}", filas[0]?.patente ?? "ABCD12"), "XXXXXX");
  console.log(`SMS (${ejemplo.length} car., ${segmentosSms(ejemplo)} SMS): ${ejemplo}`);
  if (segmentosSms(ejemplo) > 1) throw new Error("El texto pasa de 1 SMS, acortarlo antes de enviar.");
  if (!enviar) throw new Error("simulacro: no se escribió ni envió nada. Agregar --enviar");

  if (!existsSync(ARCHIVO)) writeFileSync(ARCHIVO, JSON.stringify({ enviadoEn: new Date().toISOString(), filas }, null, 2));
  for (const t of tramos) {
    const ids = filas.filter((f) => f.tramo === t && f.recordatorio).map((f) => f.id);
    const r = await enviarMensajesMasivosSms({ campana: `${CAMPANA}-${t}`, texto: TEXTO_SMS, clienteIds: ids, enviadoPor: `campana-${CAMPANA}` });
    console.log(`${CAMPANA}-${t}`, r);
  }
} catch (e) {
  console.log(`\n${(e as Error).message}`);
} finally {
  await sql.end();
  process.exit();
}
