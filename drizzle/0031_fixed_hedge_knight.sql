CREATE INDEX "citas_fecha_hora_idx" ON "citas" USING btree ("fecha_hora");--> statement-breakpoint
CREATE INDEX "citas_cliente_id_idx" ON "citas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "cartola_movimientos_fecha_idx" ON "cartola_movimientos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "movimientos_contables_fecha_idx" ON "movimientos_contables" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "ingresos_cliente_id_idx" ON "ingresos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ingresos_fecha_idx" ON "ingresos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "movimientos_inventario_fecha_idx" ON "movimientos_inventario" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "registros_mantencion_fecha_idx" ON "registros_mantencion" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "ventas_cliente_id_idx" ON "ventas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha");