// Restaura los planes que el formulario de ficha borró junto con el resto de
// los campos (ver useClientModal: guardar en "lavado único" escribe plan=""
// y vencimiento=null). Toma los valores de `auditoria.datos_anteriores` del
// mismo evento que los borró, y SOLO repone los campos que hoy siguen
// vacíos — lo que se haya editado después no se toca.
//
//   npx tsx --env-file=.env.local scripts/tmp-restaurar-planes.ts           (simulacro)
//   npx tsx --env-file=.env.local scripts/tmp-restaurar-planes.ts --aplicar (escribe)
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");
const IDS = ["c1787515957012466", "c1787260640774125"]; // GLWP93 ARTURO SOTO, LRZY59 MARIBEL CIFUENTES
const CAMPOS = ["plan", "vencimiento", "email", "rut", "giro", "vehiculo", "direccion", "razon_social"] as const;
const JSON_KEY: Record<string, string> = { razon_social: "razonSocial" };

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });

async function main() {
  const respaldo: unknown[] = [];
  for (const id of IDS) {
    const [actual] = await sql`select * from clientes where id = ${id}`;
    if (!actual) {
      console.log(`${id}: no existe`);
      continue;
    }
    const [evento] = await sql`
      select creado_en, usuario, datos_anteriores from auditoria
      where tabla = 'clientes' and registro_id = ${id} and accion = 'update'
        and coalesce(datos_anteriores->>'plan','') <> '' and datos_nuevos ? 'plan' and coalesce(datos_nuevos->>'plan','') = ''
      order by creado_en desc limit 1`;
    if (!evento) {
      console.log(`${actual.patente}: no encontré el evento que borró el plan, lo salto`);
      continue;
    }
    const previo = evento.datos_anteriores as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const campo of CAMPOS) {
      const antes = previo[JSON_KEY[campo] ?? campo];
      const hoy = actual[campo];
      if ((hoy === null || hoy === "") && antes !== null && antes !== undefined && antes !== "") patch[campo] = antes;
    }
    console.log(`\n${actual.patente} ${actual.nombre} — borrado el ${new Date(evento.creado_en).toISOString().slice(0, 16)} por ${evento.usuario}`);
    console.log(`  repone: ${JSON.stringify(patch)}`);
    respaldo.push({ id, patente: actual.patente, antes: actual, patch });
    if (!APLICAR || !Object.keys(patch).length) continue;
    await sql.begin(async (tx) => {
      await tx`update clientes set ${tx(patch)} where id = ${id}`;
      await tx`insert into auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario)
               values ('clientes', ${id}, 'update', ${sql.json(actual as never)}, ${sql.json({ ...patch, motivo: "Restauración de plan borrado por edición de ficha (auditoría 31-ago-2026)" } as never)}, 'Corrección de datos')`;
    });
    const [despues] = await sql`select plan, vencimiento::date venc from clientes where id = ${id}`;
    console.log(`  ahora: plan=${despues.plan} vence=${despues.venc?.toISOString().slice(0, 10)}`);
  }
  writeFileSync("respaldo-planes-restaurados-2026-08-31.json", JSON.stringify(respaldo, null, 2), "utf8");
  console.log(`\n${APLICAR ? "APLICADO" : "SIMULACRO (usar --aplicar para escribir)"} — respaldo en respaldo-planes-restaurados-2026-08-31.json`);
  await sql.end();
}
main();
