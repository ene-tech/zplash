-- Plan de cuentas editable para Egresos/Gastos: antes las glosas
-- (categorías) vivían hardcodeadas en el código (GASTO_GRUPOS en
-- helpers.ts). Ahora viven en esta tabla y son editables desde
-- Configuración → Categorías de gasto, sin depender de un deploy.
--
-- Los 5 GRUPOS (Otros Costos Directos, Gasto de Remuneraciones, Gastos de
-- Administración, Gastos Financieros Bancarios, Otros Egresos Fuera de la
-- Explotación) siguen siendo fijos a propósito: son la estructura del EERR
-- (qué suma y qué resta), y cambiarlos requeriría rediseñar ese reporte.
-- Lo editable son las glosas dentro de cada grupo.

create table if not exists categorias_gasto (
  id text primary key,
  nombre text not null unique,
  grupo text not null,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists categorias_gasto_grupo_idx on categorias_gasto (grupo);

alter table categorias_gasto drop constraint if exists categorias_gasto_grupo_check;
alter table categorias_gasto add constraint categorias_gasto_grupo_check
  check (grupo in (
    'Otros Costos Directos',
    'Gasto de Remuneraciones',
    'Gastos de Administración',
    'Gastos Financieros Bancarios',
    'Otros Egresos Fuera de la Explotación'
  ));

insert into categorias_gasto (id, nombre, grupo) values
  ('cg-comisiones-por-venta', 'Comisiones por Venta', 'Otros Costos Directos'),
  ('cg-insumos-de-lavado', 'Insumos de Lavado', 'Otros Costos Directos'),
  ('cg-mantencion-maquinarias', 'Mantención de Maquinarias', 'Otros Costos Directos'),
  ('cg-mantencion-instalaciones', 'Mantención de Instalaciones', 'Otros Costos Directos'),
  ('cg-aseo-limpieza', 'Aseo y Limpieza', 'Otros Costos Directos'),
  ('cg-electricidad', 'Gastos de Electricidad', 'Otros Costos Directos'),
  ('cg-agua-potable', 'Gastos de Agua Potable', 'Otros Costos Directos'),
  ('cg-ropa-utiles', 'Ropa y Útiles de Trabajo', 'Otros Costos Directos'),
  ('cg-combustibles', 'Gastos de Combustibles', 'Otros Costos Directos'),
  ('cg-otros-gastos-directos', 'Otros Gastos Directos', 'Otros Costos Directos'),
  ('cg-sueldo-base', 'Sueldo Base', 'Gasto de Remuneraciones'),
  ('cg-gratificacion', 'Gratificación', 'Gasto de Remuneraciones'),
  ('cg-aguinaldos', 'Aguinaldos', 'Gasto de Remuneraciones'),
  ('cg-aporte-patronal', 'Aporte Patronal', 'Gasto de Remuneraciones'),
  ('cg-servicios-terceros', 'Servicios de Terceros', 'Gasto de Remuneraciones'),
  ('cg-vacaciones', 'Vacaciones', 'Gasto de Remuneraciones'),
  ('cg-honorarios-profesionales', 'Honorarios Profesionales', 'Gastos de Administración'),
  ('cg-gastos-notariales', 'Gastos Notariales', 'Gastos de Administración'),
  ('cg-articulos-oficina', 'Gastos y Artículos de Oficina', 'Gastos de Administración'),
  ('cg-publicidad-papeleria', 'Gastos de Publicidad - Papelería', 'Gastos de Administración'),
  ('cg-internet-transmision', 'Gastos de Internet y Transmisión de Datos', 'Gastos de Administración'),
  ('cg-fletes-embalajes', 'Fletes y Embalajes', 'Gastos de Administración'),
  ('cg-seguros', 'Seguros', 'Gastos de Administración'),
  ('cg-arriendos', 'Arriendos', 'Gastos de Administración'),
  ('cg-pasajes-peajes', 'Gastos de Pasajes - Peajes', 'Gastos de Administración'),
  ('cg-cafeteria', 'Gastos de Cafetería y Similares', 'Gastos de Administración'),
  ('cg-seguridad', 'Gastos en Seguridad', 'Gastos de Administración'),
  ('cg-gastos-bancarios', 'Gastos Bancarios', 'Gastos Financieros Bancarios'),
  ('cg-costo-venta-activos-fijos', 'Costo de Venta por Enajenación de Activos Fijos', 'Otros Egresos Fuera de la Explotación')
on conflict (id) do nothing;

alter table categorias_gasto enable row level security;
drop policy if exists "anon full access" on categorias_gasto;
create policy "anon full access" on categorias_gasto for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
