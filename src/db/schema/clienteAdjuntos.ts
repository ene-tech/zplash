import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";
import { clientes } from "./clientes";

// Archivos adjuntos a la ficha de un cliente (comprobante de devolución u
// otro documento), subidos desde ClienteInfoModal. El archivo vive en el
// bucket PRIVADO "adjuntos-clientes" de Supabase Storage, en `ruta`
// ("<clienteId>/<id>-<nombre>"); se ve con una URL firmada corta (ver
// urlAdjuntoCliente). Ver supabase/cliente-adjuntos-2026-11-10.sql.
export const clienteAdjuntos = pgTable(
  "cliente_adjuntos",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // devolucion | otro (ver TIPOS_ADJUNTO_CLIENTE)
    detalle: text("detalle"), // a qué corresponde el documento, en palabras del que lo subió
    nombreArchivo: text("nombre_archivo").notNull(),
    tipoMime: text("tipo_mime"),
    tamano: integer("tamano"),
    ruta: text("ruta").notNull(),
    subidoEn: timestamptz("subido_en").notNull().defaultNow(),
    subidoPor: text("subido_por"),
  },
  (t) => [index("cliente_adjuntos_cliente_idx").on(t.clienteId)],
);
