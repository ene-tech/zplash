DROP INDEX "turnos_funcionario_perfil_dia_idx";--> statement-breakpoint
CREATE INDEX "turnos_funcionario_perfil_dia_idx" ON "turnos_funcionario" USING btree ("perfil_id","dia_semana");