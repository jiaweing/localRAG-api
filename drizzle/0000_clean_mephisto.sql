CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "dataset" (
	"id" serial PRIMARY KEY NOT NULL,
	"context" text NOT NULL,
	"context_embedding" vector(384),
	"content" text NOT NULL,
	"content_embedding" vector(384)
);
--> statement-breakpoint
CREATE INDEX "context_embedding_idx" ON "dataset" USING hnsw ("context_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "content_embedding_idx" ON "dataset" USING hnsw ("content_embedding" vector_cosine_ops);
