import { boolean, index, integer, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { citas } from "./agenda";
import { clientes } from "./clientes";
import { cupones } from "./cupones";
import { timestamptz } from "./shared";

export const ventas = pgTable(
  "ventas",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
    patente: text("patente").notNull(),
    nombre: text("nombre").notNull(),
    plan: text("plan").notNull().default(""),
    precio: numeric("precio", { mode: "number" }).notNull().default(0),
    tipo: text("tipo").notNull(),
    fecha: timestamptz("fecha").notNull().defaultNow(),
    creadoPor: text("creado_por"),
    metodoPago: text("metodo_pago"),
    voucher: text("voucher"),
    horaEntrega: text("hora_entrega"),
    fechaEntrega: text("fecha_entrega"),
    citaId: text("cita_id").references(() => citas.id, { onDelete: "set null" }),
    cantidadItems: integer("cantidad_items").notNull().default(1),
    notas: text("notas"),
    estadoPago: text("estado_pago"),
    montoCobrado: numeric("monto_cobrado", { mode: "number" }),
    esServicioAdicional: boolean("es_servicio_adicional").notNull().default(false),
    tipoDocumento: text("tipo_documento"),
    razonSocial: text("razon_social"),
    rut: text("rut"),
    direccion: text("direccion"),
    giro: text("giro"),
    // Email de quien compró (hoy solo se llena en Pack Empresa por web, ver
    // pagosWebpayItems.email) — permite mostrarle esta venta en Mi Cuenta
    // buscando por el correo de la sesión.
    email: text("email"),
    viaCupon: boolean("via_cupon").notNull().default(false),
    cuponCodigo: text("cupon_codigo").references(() => cupones.codigo, { onDelete: "set null" }),
  },
  (t) => [index("ventas_cliente_id_idx").on(t.clienteId), index("ventas_fecha_idx").on(t.fecha)]
);
