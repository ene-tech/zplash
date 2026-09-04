import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Libro de reclamos, sugerencias y felicitaciones que el cliente escribe
// desde Mi Cuenta (ver /api/cliente/libro). Se identifica por el email de la
// sesión OTP y no por un clienteId: clientes.email no es único (una persona
// = varias patentes) y el comentario es de la persona, no de un vehículo.
// La ficha del cliente en el panel matchea por este campo.
// ponytail: si a un cliente le corrigen el email en su ficha, sus entradas
// viejas dejan de aparecer ahí (siguen en la vista Libro, bajo el email
// antiguo); guardar clienteIds de la sesión además del email si eso duele.
export const libroComentarios = pgTable("libro_comentarios", {
  id: text("id").primaryKey(),
  // Siempre en minúsculas: la sesión de cliente ya lo normaliza así (ver
  // /api/cliente/otp/solicitar).
  email: text("email").notNull(),
  // "reclamo" | "sugerencia" | "felicitacion"
  tipo: text("tipo").notNull(),
  mensaje: text("mensaje").notNull(),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
