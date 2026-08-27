ALTER TABLE "config" ADD COLUMN "part_times" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "planilla_part_time" jsonb DEFAULT '[]'::jsonb NOT NULL;
