import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Código de un solo uso enviado por WhatsApp (plantilla, ver
// enviarMensajePlantilla en @/lib/whatsapp/enviar) para autenticar al cliente
// en el Portal Cliente (src/app/cliente), sin depender de una cuenta de
// Google. Se indexa por `telefono` y no por cliente: como clientes.telefono
// no es único, un mismo teléfono puede resolver a varias filas de `clientes`
// (varias patentes de una misma persona) y la sesión que emite
// otp/verificar/route.ts se arma para todas ellas — el código en sí solo le
// pertenece al teléfono, no a un cliente puntual. `codigo_hash` es un hash
// bcrypt (nunca se guarda el código en texto plano). `usado_en` marca el
// código como consumido tras un login exitoso; `intentos` corta la
// verificación tras varios intentos fallidos.
export const otpsCliente = pgTable(
  "otps_cliente",
  {
    id: text("id").primaryKey(),
    telefono: text("telefono").notNull(),
    codigoHash: text("codigo_hash").notNull(),
    intentos: integer("intentos").notNull().default(0),
    expiraEn: timestamptz("expira_en").notNull(),
    usadoEn: timestamptz("usado_en"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("otps_cliente_telefono_idx").on(t.telefono)]
);
