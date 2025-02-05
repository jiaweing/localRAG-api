ALTER TABLE "dataset" ADD COLUMN "file_id" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset" ADD COLUMN "folder_id" varchar(32);--> statement-breakpoint
CREATE INDEX "file_id_idx" ON "dataset" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "folder_id_idx" ON "dataset" USING btree ("folder_id");