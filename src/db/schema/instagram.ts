import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { timestamptz } from "./shared";

// Descuento por seguir a @zplash en Instagram (nov-2026, ver
// @/lib/instagram/cuponSeguidor). Una fila por cuenta de Instagram que
// respondió "ZPLASH" siguiéndonos: `codigo` es su link personal
// (zplash.cl/ig/CODIGO). Al activarlo con una patente se llenan patente,
// cliente y cupón, y desde ahí el mismo código abre el pago de un toque de
// /v/CODIGO (ver resolverLinkSms en @/lib/linkSms).
//
// Una vez por cuenta (PK ig_id) y una vez por patente (índice único parcial).
export const cuponesInstagram = pgTable(
  "cupones_instagram",
  {
    // IGSID: el id que Instagram le da a la persona dentro de nuestra cuenta.
    igId: text("ig_id").primaryKey(),
    igUsuario: text("ig_usuario"),
    codigo: text("codigo").notNull().unique(),
    patente: text("patente"),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    cuponCodigo: text("cupon_codigo"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    activadoEn: timestamptz("activado_en"),
  },
  (t) => [uniqueIndex("cupones_instagram_patente_unique").on(t.patente).where(sql`${t.patente} is not null`)]
);
