-- Supabase Security Advisor marcó "Table publicly accessible" y "Sensitive
-- data publicly accessible" (correo del 09 ago 2026, proyecto
-- iyadotbrcvxgmmmzcwam). El plan original era cubrir solo las 19 tablas
-- creadas después del bloque de RLS de schema.sql (líneas ~548-572) -- pero
-- el propio Advisor mostró que ese bloque tampoco quedó aplicado en
-- producción (bloqueos_agenda, horarios_agenda, citas, servicios,
-- categorias_ingreso, categorias_insumo, proveedores, categorias_producto,
-- insumos, productos también salen con RLS deshabilitada). schema.sql es
-- documentación, no el estado real de la base -- así que este script cubre
-- las 44 tablas del schema completo, no solo las que se sospechaba
-- faltantes. ENABLE ROW LEVEL SECURITY es idempotente: en una tabla que ya
-- la tiene habilitada no hace nada.
--
-- Con NEXT_PUBLIC_SUPABASE_ANON_KEY pública en el bundle del cliente (ver
-- src/lib/supabase.ts) y RLS deshabilitada, la API REST auto-generada de
-- Supabase sirve la tabla completa a cualquiera con esa key -- incluye
-- tarjetas Oneclick (suscripciones_oneclick), RUT/email de facturación
-- (pagos_webpay_items), hash de OTP + email (otps_cliente), cartola
-- bancaria (cartola_movimientos) y clave de perfiles (perfiles).
--
-- Esta app no usa Supabase Auth: toda la escritura/lectura pasa por Server
-- Actions vía DATABASE_URL (que se salta RLS) -- así que no se necesita
-- NINGUNA política para anon. RLS habilitada + sin políticas = acceso
-- denegado por defecto. Único uso real de la anon key: Storage (ver
-- src/lib/dataAccess/storage.ts), que no se toca acá.

alter table horarios_agenda enable row level security;
alter table bloqueos_agenda enable row level security;
alter table citas enable row level security;
alter table cita_servicios enable row level security;
alter table reglas_filtro_correo enable row level security;
alter table movimientos_contables enable row level security;
alter table cartola_movimientos enable row level security;
alter table reglas_conciliacion enable row level security;
alter table categorias_gasto enable row level security;
alter table categorias_ingreso enable row level security;
alter table clientes enable row level security;
alter table auditoria enable row level security;
alter table config enable row level security;
alter table pagos_webpay enable row level security;
alter table pagos_webpay_items enable row level security;
alter table suscripciones_oneclick enable row level security;
alter table cobros_oneclick enable row level security;
alter table precios enable row level security;
alter table precios_tamano enable row level security;
alter table maquinarias enable row level security;
alter table registros_mantencion enable row level security;
alter table alertas_mantencion enable row level security;
alter table empresas enable row level security;
alter table cupones enable row level security;
alter table otps_cliente enable row level security;
alter table perfiles enable row level security;
alter table conversaciones_whatsapp enable row level security;
alter table mensajes_whatsapp enable row level security;
alter table plantillas_whatsapp enable row level security;
alter table reglas_whatsapp enable row level security;
alter table disparos_regla_whatsapp enable row level security;
alter table plantillas_correo enable row level security;
alter table ingresos enable row level security;
alter table servicios enable row level security;
alter table ventas enable row level security;
alter table push_subscriptions enable row level security;
alter table push_subscripciones_perfil enable row level security;
alter table proveedores enable row level security;
alter table categorias_producto enable row level security;
alter table productos enable row level security;
alter table categorias_insumo enable row level security;
alter table insumos enable row level security;
alter table destinos_inventario enable row level security;
alter table movimientos_inventario enable row level security;

-- Por si algún ambiente todavía tiene las políticas "anon full access" de
-- versiones viejas de schema.sql/add-*.sql (RLS habilitada pero abierta a
-- cualquiera) -- las mismas que schema.sql ya intentaba dropear para
-- empresas/cupones/movimientos_contables/categorias_gasto/categorias_ingreso.
-- Se agregan acá el resto de las tablas donde esas políticas existieron
-- históricamente (add-cupones.sql, add-contabilidad-completo.sql,
-- add-empresas.sql, pendientes-2026-07-10.sql), para dejar TODO en
-- denegado-por-defecto.
drop policy if exists "anon full access" on empresas;
drop policy if exists "anon full access" on cupones;
drop policy if exists "anon full access" on movimientos_contables;
drop policy if exists "anon full access" on categorias_gasto;
drop policy if exists "anon full access" on categorias_ingreso;
