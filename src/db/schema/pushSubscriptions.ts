import { index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";
import { clientes } from "./clientes";
import { perfiles } from "./perfiles";

// Suscripción de Web Push (ver src/lib/push/enviar.ts) de un navegador/
// dispositivo instalado como PWA, para avisos que hoy solo se mandan por
// WhatsApp (ver el enganche en @/lib/whatsapp/reglas::ejecutarAccionRegla).
// Como la sesión del Portal Cliente puede resolver a varias filas de
// `clientes` a la vez (un mismo teléfono con varias patentes, ver
// otps_cliente), al suscribirse se inserta una fila por cada clienteId de la
// sesión con el mismo endpoint/keys — así una alerta puntual de un vehículo
// (ej. plan_proximo_vencer de una patente específica) puede enviarse
// filtrando solo por ese clienteId, sin mandarle a todos los vehículos del
// teléfono un aviso que era de uno solo. El unique es sobre (endpoint,
// cliente_id) y no sobre endpoint solo, justamente para permitir esas varias
// filas por dispositivo.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    ultimoEnvioEn: timestamptz("ultimo_envio_en"),
  },
  (t) => [
    index("push_subscriptions_cliente_id_idx").on(t.clienteId),
    unique("push_subscriptions_endpoint_cliente_id_unq").on(t.endpoint, t.clienteId),
  ]
);

// Suscripción de Web Push de un perfil de staff (ver src/lib/push/enviar.ts,
// enviarPushAGerencia) — misma mecánica que `pushSubscriptions`, pero atada a
// `perfiles` en vez de `clientes`: hoy solo la usa el aviso al perfil
// "Gerencia" cuando un cliente pide hablar con una persona en el bot de
// WhatsApp (ver OPCIONES_HUMANO en @/lib/whatsapp/router), separada de la
// tabla de clientes porque un perfil de staff no tiene fila en `clientes`.
export const pushSubscripcionesPerfil = pgTable(
  "push_subscripciones_perfil",
  {
    id: text("id").primaryKey(),
    perfilId: text("perfil_id")
      .notNull()
      .references(() => perfiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
    ultimoEnvioEn: timestamptz("ultimo_envio_en"),
  },
  (t) => [
    index("push_subscripciones_perfil_perfil_id_idx").on(t.perfilId),
    unique("push_subscripciones_perfil_endpoint_perfil_id_unq").on(t.endpoint, t.perfilId),
  ]
);
