-- Corre esto UNA SOLA VEZ, antes de usar "npm run db:migrate" por primera vez.
--
-- Contexto: hasta ahora el esquema se aplicaba a mano (schema.sql + add-*.sql)
-- y drizzle-kit no lo gestionaba. drizzle/0000_baseline.sql (generado con
-- "npm run db:generate") es el reflejo en formato de migración de ESE MISMO
-- esquema, que tu base de datos ya tiene aplicado. Si corrieras esa migración
-- tal cual con "npm run db:migrate", fallaría con "relation already exists"
-- porque intentaría crear tablas que ya existen.
--
-- Este script no crea ni modifica ninguna tabla de la app: solo crea la
-- tabla de control que usa drizzle-kit para saber qué migraciones ya se
-- aplicaron, y la marca como si 0000_baseline ya se hubiera aplicado (sin
-- ejecutar su SQL). De ahí en adelante, "npm run db:generate" +
-- "npm run db:migrate" pueden usarse para futuros cambios de esquema.
--
-- El hash y el timestamp deben coincidir exactamente con los que generó
-- drizzle-kit para drizzle/0000_baseline.sql (ver drizzle/meta/_journal.json).
-- Si en algún momento regeneras ese archivo baseline, estos valores cambian.

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT 'e239c774a955a448ec939c1ddcf85d94bdc263ce61c73f3d8e1b40055ee32a8e', 1783891105685
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = 'e239c774a955a448ec939c1ddcf85d94bdc263ce61c73f3d8e1b40055ee32a8e'
);
