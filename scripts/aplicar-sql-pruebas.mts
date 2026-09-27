// Aplica un .sql a la BASE DE PRUEBAS.
//   npx tsx --env-file=.env.pruebas scripts/aplicar-sql-pruebas.mts supabase/algo.sql
// El candado es BASE=pruebas, que solo existe en .env.pruebas: apuntado a
// producción por error, no corre.
import { readFileSync } from "node:fs";
import postgres from "postgres";

if (process.env.BASE !== "pruebas") {
  console.error("Abortado: esto solo corre contra la base de pruebas (falta BASE=pruebas).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
await sql.unsafe(readFileSync(process.argv[2], "utf8"));
console.log("aplicado:", process.argv[2]);
await sql.end();
