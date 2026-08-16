import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { timestamptz } from "./shared";

// Catálogo de plantillas de correo administrado desde Web Settings → Mail
// Templates: una fila por situación del proceso de venta/suscripción
// (confirmación de compra, pago rechazado, vencimiento próximo, etc.) o por
// comunicación de ofertas y servicios — mismo patrón de catálogo que
// `servicios`. Todavía no hay envío automático de correos: esta tabla guarda
// el contenido para cuando se conecte un proveedor de envío.
export const plantillasCorreo = pgTable("plantillas_correo", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  categoria: text("categoria"),
  asunto: text("asunto").notNull(),
  cuerpo: text("cuerpo").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Copia de cada correo que sale por el remitente automático
// (MAIL_FROM_ADDRESS, hoy no-reply@zplash.cl) vía Resend — la "bandeja de
// salida" que se ve en Correo → Salida automática. Existe porque ese
// remitente no tiene buzón IMAP propio: los correos transaccionales salen
// por API y no dejan copia en ninguna carpeta "Enviados" que se pueda leer
// como la de info@ (ver @/lib/buzon/leer), así que sin esta tabla no hay
// forma de mirar QUÉ decía exactamente lo que se le mandó a un cliente.
//
// Es distinta de disparos_regla_correo (@/db/schema/mailReglas), que registra
// el evento de negocio ("la regla X se disparó para el cliente Y") pero no el
// contenido: acá queda el asunto y el HTML ya renderizado, con las variables
// resueltas. Se escribe en enviarCorreoTransaccional (@/lib/mailing/
// proveedor), el único punto por donde pasa todo el correo automático, así
// que cubre reglas, campañas masivas y envíos únicos sin tocar cada caller.
export const correosAutomaticos = pgTable(
  "correos_automaticos",
  {
    id: text("id").primaryKey(),
    // Remitente tal como salió, no leído de env al mostrar: si mañana cambia
    // MAIL_FROM_ADDRESS, el historial tiene que seguir diciendo desde qué
    // dirección se mandó cada correo viejo.
    de: text("de").notNull(),
    para: text("para").notNull(),
    asunto: text("asunto").notNull(),
    html: text("html").notNull(),
    // "enviado" | "error" — mismo vocabulario que disparos_regla_correo,
    // menos "programado" (acá la fila se escribe recién con el resultado del
    // proveedor en la mano).
    estado: text("estado").notNull(),
    error: text("error"),
    // Id que devuelve Resend, para poder cruzar contra su dashboard (rebotes,
    // aperturas) un envío puntual sin buscarlo a ciegas por asunto y fecha.
    proveedorId: text("proveedor_id"),
    // Disparo que originó el correo, cuando vino del motor de reglas. Texto
    // suelto y no FK a propósito: borrar una ReglaCorreo arrastra sus
    // disparos en cascada, y la copia de lo que ya se envió no debería
    // desaparecer con ella.
    disparoId: text("disparo_id"),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("correos_automaticos_creado_en_idx").on(t.creadoEn), index("correos_automaticos_cliente_id_idx").on(t.clienteId)]
);
