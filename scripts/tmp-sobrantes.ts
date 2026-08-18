import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 3 });
  const db = drizzle(client);
  console.log("== correos en el dominio del local o con pinta de interno ==");
  console.log(
    JSON.stringify(
      await db.execute(sql`select patente, nombre, email, creado_por from clientes
        where email ilike '%@zplash.cl' or email ilike '%tunel%' or email ilike '%lavado%' or email ilike '%limpieza%'
           or email ilike '%recepcion%' or email ilike '%pasada%' or email ilike '%taller%' or email ilike '%local%'
        order by email`),
      null,
      1
    )
  );
  console.log("== locales cortos o sospechosos que sobrevivieron ==");
  console.log(
    JSON.stringify(
      await db.execute(sql`select patente, nombre, email from clientes
        where email is not null and (
          length(split_part(email,'@',1)) <= 4
          or split_part(email,'@',1) ~ '^[0-9]+$'
          or email ~* 'no(quier|tien|sab|se|da|s)[a-z]*@'
          or email ~* '^(sin|nada|ninguno|nose|nn|xx)'
        ) order by email limit 40`),
      null,
      1
    )
  );
  console.log("== dominios distintos que quedan, por frecuencia (top 25 raros) ==");
  console.log(
    JSON.stringify(
      await db.execute(sql`select split_part(lower(email),'@',2) dom, count(*) n from clientes
        where email is not null group by 1 having count(*) <= 2 order by n desc, dom limit 45`),
      null,
      1
    )
  );
  await client.end();
}
main();
