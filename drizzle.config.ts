import type { Config } from "drizzle-kit";

// Solo para tooling (drizzle-kit studio, introspección futura). El DDL
// sigue viviendo a mano en supabase/*.sql — esto no gestiona migraciones.
export default {
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
