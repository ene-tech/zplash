CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" text NOT NULL,
	"accion" text NOT NULL,
	"datos_anteriores" jsonb,
	"datos_nuevos" jsonb,
	"usuario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias_gasto" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"grupo" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_gasto_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"patente" text NOT NULL,
	"telefono" text,
	"email" text,
	"vehiculo" text,
	"plan" text,
	"tipo_documento" text,
	"razon_social" text,
	"rut" text,
	"direccion" text,
	"giro" text,
	"vencimiento" timestamp with time zone,
	"fecha_contratacion" timestamp with time zone,
	"origen" text DEFAULT 'LOCAL' NOT NULL,
	"visitas" integer DEFAULT 0 NOT NULL,
	"ultima_visita" timestamp with time zone,
	"ultima_renovacion" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "clientes_patente_unique" UNIQUE("patente")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"pin_admin" text DEFAULT '1234' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cupones" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre_lote" text NOT NULL,
	"valor" numeric DEFAULT 0 NOT NULL,
	"numero_lote" integer DEFAULT 1 NOT NULL,
	"total_lote" integer DEFAULT 1 NOT NULL,
	"fecha_caducidad" timestamp with time zone NOT NULL,
	"usado" boolean DEFAULT false NOT NULL,
	"patente_uso" text,
	"fecha_uso" timestamp with time zone,
	"operador_uso" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	"tipo" text DEFAULT 'vale' NOT NULL,
	"patente_asignada" text,
	"es_porcentaje" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cupones_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" text PRIMARY KEY NOT NULL,
	"razon_social" text NOT NULL,
	"rut" text NOT NULL,
	"giro" text,
	"direccion" text,
	"telefono" text,
	"contacto_cliente_id" text,
	"contacto_nombre" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "empresas_rut_unique" UNIQUE("rut")
);
--> statement-breakpoint
CREATE TABLE "ingresos" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"patente" text NOT NULL,
	"nombre" text NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"plan_estado_al_ingreso" text NOT NULL,
	"creado_por" text,
	"es_garantia" boolean DEFAULT false NOT NULL,
	"via_cupon" boolean DEFAULT false NOT NULL,
	"cupon_codigo" text,
	"glosa" text
);
--> statement-breakpoint
CREATE TABLE "movimientos_contables" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"descripcion" text NOT NULL,
	"categoria" text,
	"contraparte" text,
	"rut_proveedor" text,
	"numero_factura" text,
	"tipo_documento" text,
	"documento_url" text,
	"documento_nombre" text,
	"monto" numeric DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"metodo_pago" text,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "perfiles" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"clave" text NOT NULL,
	"modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icono" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "precios" (
	"plan" text PRIMARY KEY NOT NULL,
	"normal" numeric DEFAULT 0 NOT NULL,
	"promo" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"patente" text NOT NULL,
	"nombre" text NOT NULL,
	"plan" text DEFAULT '' NOT NULL,
	"precio" numeric DEFAULT 0 NOT NULL,
	"tipo" text NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	"metodo_pago" text,
	"voucher" text,
	"hora_entrega" text,
	"notas" text,
	"estado_pago" text,
	"monto_cobrado" numeric,
	"es_servicio_adicional" boolean DEFAULT false NOT NULL,
	"tipo_documento" text,
	"razon_social" text,
	"rut" text,
	"direccion" text,
	"giro" text,
	"via_cupon" boolean DEFAULT false NOT NULL,
	"cupon_codigo" text
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_contacto_cliente_id_clientes_id_fk" FOREIGN KEY ("contacto_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_cupon_codigo_cupones_codigo_fk" FOREIGN KEY ("cupon_codigo") REFERENCES "public"."cupones"("codigo") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cupon_codigo_cupones_codigo_fk" FOREIGN KEY ("cupon_codigo") REFERENCES "public"."cupones"("codigo") ON DELETE set null ON UPDATE no action;