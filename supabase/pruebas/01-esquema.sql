CREATE TABLE "bloqueos_agenda" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text NOT NULL,
	"todo_el_dia" boolean DEFAULT true NOT NULL,
	"hora_inicio" text,
	"hora_fin" text,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "cita_servicios" (
	"id" text PRIMARY KEY NOT NULL,
	"cita_id" text NOT NULL,
	"servicio_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"patente" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"fecha_hora" timestamp with time zone NOT NULL,
	"duracion_minutos" integer NOT NULL,
	"estado" text DEFAULT 'agendado' NOT NULL,
	"notas" text,
	"origen" text DEFAULT 'interno' NOT NULL,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_agenda" (
	"id" text PRIMARY KEY NOT NULL,
	"dia_semana" integer NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "reglas_filtro_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"combinador" text DEFAULT 'todas' NOT NULL,
	"condiciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accion" text NOT NULL,
	"carpeta_destino" text,
	"detener_evaluacion" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cierres_caja" (
	"fecha" text PRIMARY KEY NOT NULL,
	"cerrado_por" text NOT NULL,
	"cerrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resumen" jsonb NOT NULL,
	"notas" text
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
	"ilimitado_hasta" timestamp with time zone,
	"acepto_x5_en" timestamp with time zone,
	"tipo_documento" text,
	"razon_social" text,
	"rut" text,
	"direccion" text,
	"giro" text,
	"vencimiento" timestamp with time zone,
	"patente_pendiente" text,
	"patente_pendiente_desde" timestamp with time zone,
	"fecha_contratacion" timestamp with time zone,
	"suscripcion_cancelada_en" timestamp with time zone,
	"renovacion_auto_woo_desde" timestamp with time zone,
	"precio_plan_heredado" integer,
	"sin_comunicacion_auto" boolean DEFAULT false NOT NULL,
	"origen" text DEFAULT 'LOCAL' NOT NULL,
	"visitas" integer DEFAULT 0 NOT NULL,
	"ultima_visita" timestamp with time zone,
	"ultima_renovacion" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "clientes_patente_unique" UNIQUE("patente")
);
--> statement-breakpoint
CREATE TABLE "politicas_aceptadas" (
	"email" text NOT NULL,
	"version" text NOT NULL,
	"aceptado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "politicas_aceptadas_email_version_pk" PRIMARY KEY("email","version")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"horario_operador_semana_inicio" text DEFAULT '08:25' NOT NULL,
	"horario_operador_semana_fin" text DEFAULT '20:15' NOT NULL,
	"horario_operador_finde_inicio" text DEFAULT '09:55' NOT NULL,
	"horario_operador_finde_fin" text DEFAULT '19:15' NOT NULL,
	"festivos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dotacion" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"part_times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planilla_part_time" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vigencia_dias_pack_empresa" integer DEFAULT 45 NOT NULL,
	"tramos_renovacion_local" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"horas_ventana_upgrade_plan" integer DEFAULT 1 NOT NULL,
	"tramos_reactivacion_vencido" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dias_gracia_pago_atrasado" integer DEFAULT 4 NOT NULL,
	"horas_bloqueo_reingreso_plan" numeric DEFAULT 24.5 NOT NULL,
	"descuento_primera_vez_valor" integer DEFAULT 1000 NOT NULL,
	"descuento_primera_vez_dias_validez" integer DEFAULT 7 NOT NULL,
	"textos_bot_whatsapp" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imagen_precios_whatsapp" text,
	"imagen_plan_whatsapp" text,
	"firma_correo" text DEFAULT '' NOT NULL,
	"local_lat" numeric,
	"local_lng" numeric,
	"radio_asistencia_metros" integer DEFAULT 150 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartola_movimientos" (
	"id" text PRIMARY KEY NOT NULL,
	"cuenta" text DEFAULT 'santander_empresa' NOT NULL,
	"fecha" timestamp with time zone NOT NULL,
	"glosa" text NOT NULL,
	"cargo" numeric DEFAULT 0 NOT NULL,
	"abono" numeric DEFAULT 0 NOT NULL,
	"saldo" numeric,
	"numero_documento" text,
	"sucursal" text,
	"categoria" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"movimiento_contable_id" text,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
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
CREATE TABLE "categorias_ingreso" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_ingreso_nombre_unique" UNIQUE("nombre")
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
	"creado_por" text,
	"fecha_pago" timestamp with time zone,
	"venta_id" text
);
--> statement-breakpoint
CREATE TABLE "reglas_conciliacion" (
	"id" text PRIMARY KEY NOT NULL,
	"categoria" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
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
	"rut" text,
	"patentes_autorizadas" jsonb,
	"un_cupon_por_patente" boolean DEFAULT false NOT NULL,
	"un_uso_por_patente" boolean DEFAULT false NOT NULL,
	"patentes_usadas" jsonb,
	"solo_clientes_nuevos" boolean DEFAULT false NOT NULL,
	"canal" text DEFAULT 'ambos' NOT NULL,
	"email" text,
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
CREATE TABLE "estanques" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"contenido" text,
	"capacidad_litros" numeric NOT NULL,
	"offset_crudo" numeric DEFAULT 0 NOT NULL,
	"litros_por_unidad" numeric DEFAULT 1 NOT NULL,
	"umbral_bajo_litros" numeric,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "estanques_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "lecturas_estanque" (
	"id" text PRIMARY KEY NOT NULL,
	"estanque_id" text NOT NULL,
	"crudo" numeric NOT NULL,
	"medido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valvulas" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"estanque_id" text,
	"abierta" boolean DEFAULT false NOT NULL,
	"cambiado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cambiado_por" text,
	"confirmada_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "valvulas_nombre_unique" UNIQUE("nombre")
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
	"glosa" text,
	"cita_id" text
);
--> statement-breakpoint
CREATE TABLE "destinos_inventario" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"es_bodega" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinos_inventario_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "movimientos_inventario" (
	"id" text PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"producto_id" text NOT NULL,
	"origen_id" text NOT NULL,
	"destino_id" text NOT NULL,
	"cantidad" integer NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"notas" text,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "categorias_insumo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_insumo_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria_id" text,
	"valor_compra" numeric DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"stock_min" integer DEFAULT 0 NOT NULL,
	"stock_max" integer DEFAULT 0 NOT NULL,
	"proveedor_id" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "categorias_producto" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_producto_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"sku" text NOT NULL,
	"detalle" text NOT NULL,
	"categoria_id" text,
	"valor_compra" numeric DEFAULT 0 NOT NULL,
	"valor_venta" numeric DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"stock_min" integer DEFAULT 0 NOT NULL,
	"stock_max" integer DEFAULT 0 NOT NULL,
	"empaque_minimo" integer DEFAULT 1 NOT NULL,
	"proveedor_id" text,
	"activo" boolean DEFAULT true NOT NULL,
	"destinos_bloqueados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "productos_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "productos_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rut" text,
	"telefono" text,
	"email" text,
	"direccion" text,
	"contacto" text,
	"email_vendedor" text,
	"telefono_vendedor" text,
	"email_comprobantes" text,
	"banco" text,
	"cuenta_corriente" text,
	"categoria_gasto" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "libro_comentarios" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"tipo" text NOT NULL,
	"mensaje" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correos_automaticos" (
	"id" text PRIMARY KEY NOT NULL,
	"de" text NOT NULL,
	"para" text NOT NULL,
	"asunto" text NOT NULL,
	"html" text NOT NULL,
	"estado" text NOT NULL,
	"error" text,
	"proveedor_id" text,
	"disparo_id" text,
	"cliente_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantillas_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"asunto" text NOT NULL,
	"cuerpo" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disparos_regla_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"regla_id" text NOT NULL,
	"origen_tipo" text NOT NULL,
	"origen_id" text NOT NULL,
	"cliente_id" text,
	"patente" text,
	"estado" text DEFAULT 'programado' NOT NULL,
	"error" text,
	"enviar_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disparos_regla_correo_regla_origen_unq" UNIQUE("regla_id","origen_tipo","origen_id")
);
--> statement-breakpoint
CREATE TABLE "reglas_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"tipo_evento" text NOT NULL,
	"condicion_tipo_venta" text,
	"condicion_planes" jsonb,
	"condicion_dias_antes_vencimiento" integer,
	"condicion_solo_sin_autopago" boolean DEFAULT false NOT NULL,
	"condicion_solo_con_promo_renovacion" boolean DEFAULT false NOT NULL,
	"condicion_dias_despues_vencimiento" integer,
	"condicion_pasadas_max" integer,
	"condicion_pasadas_min" integer,
	"delay_dias" integer DEFAULT 0 NOT NULL,
	"plantilla_correo_id" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "alertas_mantencion" (
	"id" text PRIMARY KEY NOT NULL,
	"maquinaria_id" text NOT NULL,
	"descripcion" text NOT NULL,
	"fecha_objetivo" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	"completado_en" timestamp with time zone,
	"registro_mantencion_id" text
);
--> statement-breakpoint
CREATE TABLE "maquinarias" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"zona" text,
	"tipo" text,
	"activo" boolean DEFAULT true NOT NULL,
	"periodicidad_tipo" text,
	"intervalo_dias" integer,
	"intervalo_lavados" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "maquinarias_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "planes_mantencion" (
	"id" text PRIMARY KEY NOT NULL,
	"maquinaria_id" text NOT NULL,
	"descripcion" text NOT NULL,
	"repuestos" text,
	"periodicidad_tipo" text NOT NULL,
	"intervalo_dias" integer,
	"intervalo_lavados" integer,
	"aviso_dias" integer,
	"aviso_lavados" integer,
	"ultima_vez_en" timestamp with time zone,
	"lavados_previos" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "registros_mantencion" (
	"id" text PRIMARY KEY NOT NULL,
	"maquinaria_id" text NOT NULL,
	"plan_id" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"descripcion" text NOT NULL,
	"responsable" text,
	"costo" numeric,
	"vehiculos_desde_ultima" integer DEFAULT 0 NOT NULL,
	"notas" text,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "otps_cliente" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobros_oneclick" (
	"id" text PRIMARY KEY NOT NULL,
	"suscripcion_id" text NOT NULL,
	"ciclo_ym" text NOT NULL,
	"monto" numeric NOT NULL,
	"estado" text NOT NULL,
	"response_code" integer,
	"authorization_code" text,
	"venta_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_webpay" (
	"buy_order" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"patente" text NOT NULL,
	"tipo" text NOT NULL,
	"servicio_id" text,
	"monto" numeric NOT NULL,
	"estado" text DEFAULT 'iniciada' NOT NULL,
	"token" text,
	"authorization_code" text,
	"response_code" integer,
	"venta_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pagos_webpay_items" (
	"id" text PRIMARY KEY NOT NULL,
	"buy_order" text NOT NULL,
	"tipo" text NOT NULL,
	"servicio_id" text,
	"nombre" text NOT NULL,
	"monto" numeric NOT NULL,
	"venta_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo_documento" text,
	"razon_social" text,
	"rut" text,
	"direccion" text,
	"giro" text,
	"email" text,
	"cantidad_cupones" integer,
	"patentes_autorizadas" jsonb,
	"cupon_codigo" text,
	"nombre_lote" text
);
--> statement-breakpoint
CREATE TABLE "suscripciones_oneclick" (
	"id" text PRIMARY KEY NOT NULL,
	"patente" text NOT NULL,
	"cliente_id" text,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"token_inscripcion" text,
	"tbk_user" text,
	"card_tipo" text,
	"card_ultimos_digitos" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"proximo_cobro" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "perfiles" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"clave" text NOT NULL,
	"clave_version" integer DEFAULT 1 NOT NULL,
	"modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icono" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "contratos_funcionario" (
	"id" text PRIMARY KEY NOT NULL,
	"cargo" text NOT NULL,
	"tipo_contrato" text NOT NULL,
	"jornada_horas_semana" integer,
	"fecha_inicio" text NOT NULL,
	"fecha_termino" text,
	"documento_url" text,
	"notas" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcas_asistencia" (
	"id" text PRIMARY KEY NOT NULL,
	"perfil_id" text NOT NULL,
	"perfil_nombre" text NOT NULL,
	"fecha" text NOT NULL,
	"tipo" text NOT NULL,
	"marcado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric,
	"lng" numeric,
	"precision_m" integer,
	"distancia_m" integer,
	"en_el_local" boolean,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "reglas_operador" (
	"id" text PRIMARY KEY NOT NULL,
	"dias" text NOT NULL,
	"hora_desde" text NOT NULL,
	"hora_hasta" text NOT NULL,
	"vetados" text,
	"zona_fija" text,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "tareas_turno" (
	"id" text PRIMARY KEY NOT NULL,
	"turno" text NOT NULL,
	"zona" text DEFAULT 'prelavado' NOT NULL,
	"descripcion" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tareas_turno_hechas" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text NOT NULL,
	"turno" text NOT NULL,
	"zona" text DEFAULT 'prelavado' NOT NULL,
	"tarea_id" text NOT NULL,
	"perfil_id" text NOT NULL,
	"perfil_nombre" text NOT NULL,
	"completado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "turnos_funcionario" (
	"id" text PRIMARY KEY NOT NULL,
	"perfil_id" text NOT NULL,
	"dia_semana" integer NOT NULL,
	"turno" text DEFAULT 'normal' NOT NULL,
	"zona" text,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precios" (
	"plan" text PRIMARY KEY NOT NULL,
	"normal" numeric DEFAULT 0 NOT NULL,
	"promo" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precios_tamano" (
	"servicio_id" text PRIMARY KEY NOT NULL,
	"s" numeric DEFAULT 0 NOT NULL,
	"m" numeric DEFAULT 0 NOT NULL,
	"l" numeric DEFAULT 0 NOT NULL,
	"xl" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscripciones_perfil" (
	"id" text PRIMARY KEY NOT NULL,
	"perfil_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_en" timestamp with time zone,
	CONSTRAINT "push_subscripciones_perfil_endpoint_perfil_id_unq" UNIQUE("endpoint","perfil_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_en" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_cliente_id_unq" UNIQUE("endpoint","cliente_id")
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"duracion_minutos" integer DEFAULT 30 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
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
	"fecha_entrega" text,
	"cita_id" text,
	"cantidad_items" integer DEFAULT 1 NOT NULL,
	"notas" text,
	"estado_pago" text,
	"monto_cobrado" numeric,
	"es_servicio_adicional" boolean DEFAULT false NOT NULL,
	"tipo_documento" text,
	"razon_social" text,
	"rut" text,
	"direccion" text,
	"giro" text,
	"email" text,
	"via_cupon" boolean DEFAULT false NOT NULL,
	"cupon_codigo" text,
	"factura_emitida" boolean DEFAULT false NOT NULL,
	"canjeada_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversaciones_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"telefono" text NOT NULL,
	"cliente_id" text,
	"nombre_contacto" text,
	"flow_state" jsonb,
	"ultimo_mensaje_en" timestamp with time zone DEFAULT now() NOT NULL,
	"no_leidos" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversaciones_whatsapp_telefono_unique" UNIQUE("telefono")
);
--> statement-breakpoint
CREATE TABLE "disparos_regla_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"regla_id" text NOT NULL,
	"origen_tipo" text NOT NULL,
	"origen_id" text NOT NULL,
	"cliente_id" text,
	"patente" text,
	"cupon_id" text,
	"mensaje_whatsapp_id" text,
	"estado" text DEFAULT 'programado' NOT NULL,
	"enviar_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disparos_regla_whatsapp_regla_origen_unq" UNIQUE("regla_id","origen_tipo","origen_id")
);
--> statement-breakpoint
CREATE TABLE "mensajes_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"conversacion_id" text NOT NULL,
	"direccion" text NOT NULL,
	"texto" text NOT NULL,
	"tipo" text DEFAULT 'texto' NOT NULL,
	"estado" text,
	"whatsapp_message_id" text,
	"enviado_por" text,
	"error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opiniones" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"telefono" text NOT NULL,
	"nota" integer NOT NULL,
	"comentario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opiniones_nota_rango" CHECK ("opiniones"."nota" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "plantillas_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"mensaje" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"meta_nombre" text,
	"meta_idioma" text,
	"meta_variables" jsonb,
	"meta_aprobado" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reglas_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"tipo_evento" text NOT NULL,
	"condicion_tipo_venta" text,
	"condicion_planes" jsonb,
	"condicion_excluir_con_cupon" boolean DEFAULT false NOT NULL,
	"condicion_dias_antes_vencimiento" integer,
	"condicion_pasadas_min" integer,
	"delay_dias" integer DEFAULT 0 NOT NULL,
	"accion" text NOT NULL,
	"cupon_es_porcentaje" boolean DEFAULT false NOT NULL,
	"cupon_valor" numeric,
	"cupon_validez_dias" integer,
	"plantilla_whatsapp_id" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartola_movimientos" ADD CONSTRAINT "cartola_movimientos_movimiento_contable_id_movimientos_contables_id_fk" FOREIGN KEY ("movimiento_contable_id") REFERENCES "public"."movimientos_contables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_contacto_cliente_id_clientes_id_fk" FOREIGN KEY ("contacto_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturas_estanque" ADD CONSTRAINT "lecturas_estanque_estanque_id_estanques_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valvulas" ADD CONSTRAINT "valvulas_estanque_id_estanques_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanques"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_cupon_codigo_cupones_codigo_fk" FOREIGN KEY ("cupon_codigo") REFERENCES "public"."cupones"("codigo") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_origen_id_destinos_inventario_id_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."destinos_inventario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_destino_id_destinos_inventario_id_fk" FOREIGN KEY ("destino_id") REFERENCES "public"."destinos_inventario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_categoria_id_categorias_insumo_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_insumo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_producto_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_producto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correos_automaticos" ADD CONSTRAINT "correos_automaticos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_correo" ADD CONSTRAINT "disparos_regla_correo_regla_id_reglas_correo_id_fk" FOREIGN KEY ("regla_id") REFERENCES "public"."reglas_correo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_correo" ADD CONSTRAINT "disparos_regla_correo_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_correo" ADD CONSTRAINT "reglas_correo_plantilla_correo_id_plantillas_correo_id_fk" FOREIGN KEY ("plantilla_correo_id") REFERENCES "public"."plantillas_correo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_mantencion" ADD CONSTRAINT "alertas_mantencion_maquinaria_id_maquinarias_id_fk" FOREIGN KEY ("maquinaria_id") REFERENCES "public"."maquinarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_mantencion" ADD CONSTRAINT "alertas_mantencion_registro_mantencion_id_registros_mantencion_id_fk" FOREIGN KEY ("registro_mantencion_id") REFERENCES "public"."registros_mantencion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planes_mantencion" ADD CONSTRAINT "planes_mantencion_maquinaria_id_maquinarias_id_fk" FOREIGN KEY ("maquinaria_id") REFERENCES "public"."maquinarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_mantencion" ADD CONSTRAINT "registros_mantencion_maquinaria_id_maquinarias_id_fk" FOREIGN KEY ("maquinaria_id") REFERENCES "public"."maquinarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_mantencion" ADD CONSTRAINT "registros_mantencion_plan_id_planes_mantencion_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes_mantencion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros_oneclick" ADD CONSTRAINT "cobros_oneclick_suscripcion_id_suscripciones_oneclick_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones_oneclick"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros_oneclick" ADD CONSTRAINT "cobros_oneclick_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_webpay" ADD CONSTRAINT "pagos_webpay_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_webpay_items" ADD CONSTRAINT "pagos_webpay_items_buy_order_pagos_webpay_buy_order_fk" FOREIGN KEY ("buy_order") REFERENCES "public"."pagos_webpay"("buy_order") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_webpay_items" ADD CONSTRAINT "pagos_webpay_items_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones_oneclick" ADD CONSTRAINT "suscripciones_oneclick_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_funcionario" ADD CONSTRAINT "contratos_funcionario_id_perfiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_operador" ADD CONSTRAINT "reglas_operador_id_perfiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_funcionario" ADD CONSTRAINT "turnos_funcionario_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_tamano" ADD CONSTRAINT "precios_tamano_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscripciones_perfil" ADD CONSTRAINT "push_subscripciones_perfil_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cupon_codigo_cupones_codigo_fk" FOREIGN KEY ("cupon_codigo") REFERENCES "public"."cupones"("codigo") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_regla_id_reglas_whatsapp_id_fk" FOREIGN KEY ("regla_id") REFERENCES "public"."reglas_whatsapp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_cupon_id_cupones_id_fk" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_mensaje_whatsapp_id_mensajes_whatsapp_id_fk" FOREIGN KEY ("mensaje_whatsapp_id") REFERENCES "public"."mensajes_whatsapp"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_conversacion_id_conversaciones_whatsapp_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones_whatsapp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opiniones" ADD CONSTRAINT "opiniones_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_whatsapp" ADD CONSTRAINT "reglas_whatsapp_plantilla_whatsapp_id_plantillas_whatsapp_id_fk" FOREIGN KEY ("plantilla_whatsapp_id") REFERENCES "public"."plantillas_whatsapp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citas_fecha_hora_idx" ON "citas" USING btree ("fecha_hora");--> statement-breakpoint
CREATE INDEX "citas_cliente_id_idx" ON "citas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "cartola_movimientos_fecha_idx" ON "cartola_movimientos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "movimientos_contables_fecha_idx" ON "movimientos_contables" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "lecturas_estanque_estanque_idx" ON "lecturas_estanque" USING btree ("estanque_id","medido_en" desc);--> statement-breakpoint
CREATE INDEX "valvulas_estanque_idx" ON "valvulas" USING btree ("estanque_id");--> statement-breakpoint
CREATE INDEX "ingresos_cliente_id_idx" ON "ingresos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ingresos_fecha_idx" ON "ingresos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "movimientos_inventario_fecha_idx" ON "movimientos_inventario" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "correos_automaticos_creado_en_idx" ON "correos_automaticos" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "correos_automaticos_cliente_id_idx" ON "correos_automaticos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "alertas_mantencion_fecha_objetivo_idx" ON "alertas_mantencion" USING btree ("fecha_objetivo");--> statement-breakpoint
CREATE INDEX "planes_mantencion_maquinaria_idx" ON "planes_mantencion" USING btree ("maquinaria_id");--> statement-breakpoint
CREATE INDEX "registros_mantencion_fecha_idx" ON "registros_mantencion" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "otps_cliente_email_idx" ON "otps_cliente" USING btree ("email");--> statement-breakpoint
CREATE INDEX "marcas_asistencia_fecha_idx" ON "marcas_asistencia" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "marcas_asistencia_perfil_idx" ON "marcas_asistencia" USING btree ("perfil_id");--> statement-breakpoint
CREATE INDEX "tareas_turno_turno_idx" ON "tareas_turno" USING btree ("turno");--> statement-breakpoint
CREATE INDEX "tareas_turno_hechas_fecha_idx" ON "tareas_turno_hechas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "turnos_funcionario_perfil_dia_idx" ON "turnos_funcionario" USING btree ("perfil_id","dia_semana");--> statement-breakpoint
CREATE INDEX "push_subscripciones_perfil_perfil_id_idx" ON "push_subscripciones_perfil" USING btree ("perfil_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_cliente_id_idx" ON "push_subscriptions" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ventas_cliente_id_idx" ON "ventas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "mensajes_whatsapp_conversacion_fecha_idx" ON "mensajes_whatsapp" USING btree ("conversacion_id","creado_en");--> statement-breakpoint
CREATE INDEX "opiniones_creado_en_idx" ON "opiniones" USING btree ("creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "opiniones_cliente_id_idx" ON "opiniones" USING btree ("cliente_id");
--
-- RLS: la app escribe por Server Actions con DATABASE_URL (se salta RLS).
-- Sin policies para anon = acceso denegado por defecto desde el navegador.
--
ALTER TABLE "alertas_mantencion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bloqueos_agenda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cartola_movimientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categorias_gasto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categorias_ingreso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categorias_insumo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categorias_producto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cierres_caja" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cita_servicios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "citas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cobros_oneclick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contratos_funcionario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversaciones_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "correos_automaticos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cupones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "destinos_inventario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disparos_regla_correo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disparos_regla_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "empresas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "estanques" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "horarios_agenda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingresos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insumos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lecturas_estanque" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "libro_comentarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maquinarias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marcas_asistencia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mensajes_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimientos_contables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimientos_inventario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opiniones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "otps_cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagos_webpay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagos_webpay_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "perfiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planes_mantencion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantillas_correo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantillas_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "politicas_aceptadas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "precios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "precios_tamano" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proveedores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscripciones_perfil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registros_mantencion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reglas_conciliacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reglas_correo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reglas_filtro_correo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reglas_operador" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reglas_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "servicios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suscripciones_oneclick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tareas_turno" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tareas_turno_hechas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "turnos_funcionario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "valvulas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ventas" ENABLE ROW LEVEL SECURITY;
