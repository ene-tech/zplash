import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Código de un solo uso enviado por correo (ver enviarCodigoOtpCliente en
// @/lib/buzon/otp) para autenticar al cliente en el Portal Cliente
// (src/app/cliente), sin depender de una cuenta de Google. Antes se enviaba
// por WhatsApp (plantilla paga); se migró a correo porque el buzón propio
// (SMTP Banahost, ver @/lib/buzon/cliente) no tiene costo por envío — ver
// migraciones 0052-0054 para el paso de `telefono` a `email` en esta tabla.
// Se indexa por `email` y no por cliente: como clientes.email no es único,
// un mismo correo puede resolver a varias filas de `clientes` (varias
// patentes de una misma persona) y la sesión que emite otp/verificar/route.ts
// se arma para todas ellas — el código en sí solo le pertenece al correo, no
// a un cliente puntual. `codigo_hash` es un hash bcrypt (nunca se guarda el
// código en texto plano). `usado_en` marca el código como consumido tras un
// login exitoso; `intentos` corta la verificación tras varios intentos
// fallidos.
export const otpsCliente = pgTable(
  "otps_cliente",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codigoHash: text("codigo_hash").notNull(),
    intentos: integer("intentos").notNull().default(0),
    expiraEn: timestamptz("expira_en").notNull(),
    usadoEn: timestamptz("usado_en"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("otps_cliente_email_idx").on(t.email)]
);
