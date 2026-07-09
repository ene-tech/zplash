-- Restricciones a nivel de base de datos para movimientos_contables: sin
-- esto, nada impedía guardar un "tipo" o "estado" inválido, o una
-- combinación imposible (ej. un cuenta_por_cobrar con estado "x_rendir"),
-- insertando directo contra la API de Supabase con la anon key.
-- "cuenta_por_pagar" ya no es un tipo válido: esa pestaña ahora deriva de
-- egresos con estado x_rendir/pendiente_pago (ver CuentasPorPagarTab). Se
-- confirmó que no hay filas existentes con ese tipo antes de retirarlo.
alter table movimientos_contables drop constraint if exists movimientos_contables_tipo_check;
alter table movimientos_contables add constraint movimientos_contables_tipo_check
  check (tipo in ('ingreso', 'egreso', 'cuenta_por_cobrar'));

alter table movimientos_contables drop constraint if exists movimientos_contables_estado_check;
alter table movimientos_contables add constraint movimientos_contables_estado_check
  check (
    (tipo = 'egreso' and estado in ('pagado_cc', 'x_rendir', 'pendiente_pago'))
    or (tipo <> 'egreso' and estado in ('pagado', 'pendiente'))
  );

alter table movimientos_contables drop constraint if exists movimientos_contables_tipo_documento_check;
alter table movimientos_contables add constraint movimientos_contables_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('Boleta', 'Factura'));
