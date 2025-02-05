import {
  index,
  pgTable,
  serial,
  text,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

export const dataset = pgTable(
  "dataset",
  {
    id: serial("id").primaryKey(),
    file_id: varchar("file_id", { length: 32 }).notNull(),
    folder_id: varchar("folder_id", { length: 32 }),
    context: text("context").notNull(),
    context_embedding: vector("context_embedding", { dimensions: 384 }),
    content: text("content").notNull(),
    content_embedding: vector("content_embedding", { dimensions: 384 }),
  },
  (table) => ({
    contextEmbeddingIndex: index("context_embedding_idx").using(
      "hnsw",
      table.context_embedding.op("vector_cosine_ops")
    ),
    contentEmbeddingIndex: index("content_embedding_idx").using(
      "hnsw",
      table.content_embedding.op("vector_cosine_ops")
    ),
    fileIdIndex: index("file_id_idx").on(table.file_id),
    folderIdIndex: index("folder_id_idx").on(table.folder_id),
  })
);
