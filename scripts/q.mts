// Consola SQL de SOLO LECTURA contra la base. Ojo: es la de PRODUCCIÓN, no hay
// copia local (por eso existe este runner y no un `psql` a mano).
//
// Uso: npx tsx --env-file=.env.local scripts/q.mts "select ..."
//      npx tsx --env-file=.env.local scripts/q.mts --json "select ..." > salida.json
//      echo "select ..." | npx tsx --env-file=.env.local scripts/q.mts
//
// La garantía de no-escritura la da el motor, no un regex sobre el texto: la
// consulta corre dentro de una transacción `read only`, así que un
// insert/update/delete lo rechaza Postgres (25006) aunque se cuele en el SQL.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const args = process.argv.slice(2);
const json = args.includes("--json");
const inline = args.filter((a) => a !== "--json").join(" ").trim();
const query = inline || (process.stdin.isTTY ? "" : readFileSync(0, "utf8").trim());

if (!query) {
  console.error('Falta la consulta. Ej: npx tsx --env-file=.env.local scripts/q.mts "select count(*) from clientes"');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const filas = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return tx.unsafe(query);
  });
  if (json) console.log(JSON.stringify(filas, null, 2));
  else {
    console.table(filas);
    console.log(`${filas.length} fila(s)`);
  }
} finally {
  await sql.end();
}
