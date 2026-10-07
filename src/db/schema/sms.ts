import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { timestamptz } from "./shared";

// Un SMS enviado (o intentado) por campaña — canal paralelo a WhatsApp para
// campañas masivas, más barato por mensaje que un template MARKETING de Meta
// (ver @/lib/sms). Solo salientes: no hay número de respuesta.
//
// `campana` agrupa el envío: sirve para medir la campaña y para no mandarle
// dos veces la misma al mismo cliente si un envío se corta y se reintenta (ver
// enviarMensajesMasivosSms). `codigoBaja` es el código del link de baja que va
// al pie de cada mensaje (/b/[codigo]): identifica al cliente sin exponer su
// patente ni su id en la URL. onDelete "set null" como mensajes_whatsapp: borrar
// un cliente no borra el registro de lo que se le mandó.
export const mensajesSms = pgTable(
  "mensajes_sms",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    telefono: text("telefono").notNull(),
    campana: text("campana").notNull(),
    texto: text("texto").notNull(),
    segmentos: integer("segmentos").notNull(),
    estado: text("estado").notNull(),
    proveedorId: text("proveedor_id"),
    codigoBaja: text("codigo_baja").notNull().unique(),
    enviadoPor: text("enviado_por"),
    error: text("error"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("mensajes_sms_campana_idx").on(t.campana), index("mensajes_sms_cliente_idx").on(t.clienteId)]
);
