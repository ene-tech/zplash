import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { timestamptz } from "./shared";

// Un hilo de conversación por número de WhatsApp (wa_id que manda Meta en
// cada webhook, formato E.164 sin "+"). `clienteId` es opcional: se intenta
// enlazar por teléfono contra `clientes` (ver buscarOCrearConversacion en
// @/lib/dataAccess/whatsapp), pero un número puede escribir sin ser cliente
// todavía. onDelete "set null" porque borrar un cliente no debe borrar su
// historial de conversación, mismo patrón que suscripciones_oneclick.
export const conversacionesWhatsapp = pgTable("conversaciones_whatsapp", {
  id: text("id").primaryKey(),
  telefono: text("telefono").notNull().unique(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  nombreContacto: text("nombre_contacto"),
  ultimoMensajeEn: timestamptz("ultimo_mensaje_en").notNull().defaultNow(),
  noLeidos: integer("no_leidos").notNull().default(0),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Mensaje individual dentro de una conversación. `whatsappMessageId` es el
// wamid que devuelve la Graph API al mandar un mensaje (o que trae el webhook
// para uno entrante) — se usa para correlacionar los webhooks de status
// (entregado/leído/fallido) con la fila correspondiente. `estado` solo aplica
// a mensajes salientes; uno entrante queda sin ese dato.
export const mensajesWhatsapp = pgTable(
  "mensajes_whatsapp",
  {
    id: text("id").primaryKey(),
    conversacionId: text("conversacion_id")
      .notNull()
      .references(() => conversacionesWhatsapp.id, { onDelete: "cascade" }),
    direccion: text("direccion").notNull(),
    texto: text("texto").notNull(),
    tipo: text("tipo").notNull().default("texto"),
    estado: text("estado"),
    whatsappMessageId: text("whatsapp_message_id"),
    enviadoPor: text("enviado_por"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("mensajes_whatsapp_conversacion_fecha_idx").on(t.conversacionId, t.creadoEn)]
);
