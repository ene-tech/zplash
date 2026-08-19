DROP INDEX "lecturas_estanque_estanque_idx";--> statement-breakpoint
CREATE INDEX "lecturas_estanque_estanque_idx" ON "lecturas_estanque" USING btree ("estanque_id","medido_en" desc);