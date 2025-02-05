import { randomBytes } from "crypto";
import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Context } from "hono";
import { dataset } from "../db/schema.js";
import { DATABASE_URL, DEFAULT_CHAT_MODEL, EMBEDDING_MODEL } from "./config.js";
import { getEmbedding } from "./embeddings.js";
import { generateContext, splitIntoChunks } from "./rag.js";
import { rerankChunks } from "./reranking.js";
import { Chunk, ChunkWithScore } from "./types.js";

// Initialize database connection
const db = drizzle(DATABASE_URL);

// Generate a unique file ID
function generateFileId(): string {
  return randomBytes(16).toString("hex");
}

export const handleStoreDocument = async (c: Context) => {
  try {
    const {
      document,
      folder_id,
      chunkSize = 500,
      overlap = 50,
      generateContexts = false,
      useOpenAI = false,
    } = await c.req.json();

    if (!document) {
      return c.json({ error: "Document text is required" }, 400);
    }

    // Generate a unique file ID for this document
    const file_id = generateFileId();

    // Split document into chunks with optional context generation
    const chunks = await splitIntoChunks(
      document,
      chunkSize,
      overlap,
      generateContexts
    );

    // Generate embeddings and context for each chunk and store in the database
    const processedChunks = await Promise.all(
      chunks.map(async (chunk: ChunkWithScore) => {
        const contentEmbedding = await getEmbedding(
          chunk.content,
          EMBEDDING_MODEL
        );
        // Generate context for the chunk using the complete document if enabled
        const chunkContext = generateContexts
          ? await generateContext(chunk.content, document, useOpenAI)
          : chunk.content;
        const contextEmbedding = await getEmbedding(
          chunkContext,
          EMBEDDING_MODEL
        );

        // Insert into the database
        const insertedChunk = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(dataset)
            .values({
              content: chunk.content,
              content_embedding: contentEmbedding,
              context: chunkContext,
              context_embedding: contextEmbedding,
              file_id,
              folder_id,
            })
            .returning();

          if (!inserted || inserted.length === 0) {
            throw new Error("Failed to insert chunk into database");
          }

          return inserted[0];
        });

        const chunkData: Chunk = {
          content: insertedChunk.content,
          context: insertedChunk.context,
          content_embedding: insertedChunk.content_embedding ?? [],
          context_embedding: insertedChunk.context_embedding ?? [],
          metadata: {
            document,
            timestamp: new Date().toISOString(),
          },
        };

        return chunkData;
      })
    );

    return c.json({
      message: "Document chunks processed successfully",
      file_id,
      folder_id, // Include folder_id in response if provided
      chunks: processedChunks,
    });
  } catch (error) {
    console.error("Error storing document:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
};

export const handleSearchChunks = async (c: Context) => {
  try {
    const {
      query,
      folder_id,
      top_k = 3,
      threshold = 0.0,
      shouldRerank = true,
    } = await c.req.json();

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    if (typeof threshold !== "number" || threshold < 0 || threshold > 1) {
      return c.json(
        { error: "Threshold must be a number between 0 and 1" },
        400
      );
    }

    // Get query embedding
    const queryEmbedding = await getEmbedding(query, EMBEDDING_MODEL);

    // Calculate content and context similarities using SQL
    const contentSimilarity = sql<number>`1 - ${cosineDistance(
      dataset.content_embedding,
      queryEmbedding
    )}`;

    const contextSimilarity = sql<number>`1 - ${cosineDistance(
      dataset.context_embedding,
      queryEmbedding
    )}`;

    // Combined similarity with weighted average (0.6 content, 0.4 context)
    const combinedSimilarity = sql<number>`(0.6 * ${contentSimilarity} + 0.4 * ${contextSimilarity})`;

    // Get similar chunks from the database with conditional folder filtering
    const similarChunks = await db
      .select({
        content: dataset.content,
        context: dataset.context,
        file_id: dataset.file_id,
        folder_id: dataset.folder_id,
        content_score: contentSimilarity,
        context_score: contextSimilarity,
        combined_score: combinedSimilarity,
      })
      .from(dataset)
      .where(
        folder_id
          ? sql`${combinedSimilarity} >= ${threshold} AND ${eq(
              dataset.folder_id,
              folder_id
            )}`
          : sql`${combinedSimilarity} >= ${threshold}`
      )
      .orderBy(desc(combinedSimilarity))
      .limit(top_k);

    // Log results for debugging
    console.log(
      "Top results with similarities:",
      similarChunks.slice(0, 5).map((r, index) => ({
        rank: index + 1,
        content_score: r.content_score,
        context_score: r.context_score,
        combined_score: r.combined_score,
        content: r.content.substring(0, 100) + "...",
      }))
    );

    // Convert to ChunkWithScore type with file and folder IDs
    let results: ChunkWithScore[] = similarChunks.map((chunk) => ({
      content: chunk.content,
      context: chunk.context,
      metadata: {
        file_id: chunk.file_id,
        folder_id: chunk.folder_id,
      },
      scores: {
        content: chunk.content_score,
        context: chunk.context_score,
        combined: chunk.combined_score,
      },
    }));

    // Rerank if specified
    if (shouldRerank) {
      const rerankedResults = await rerankChunks(
        query,
        similarChunks.map((c) => c.content),
        DEFAULT_CHAT_MODEL
      );

      // Update scores with reranked values
      results = results.map((chunk, i) => ({
        ...chunk,
        scores: {
          ...chunk.scores,
          reranked: rerankedResults[i]?.score,
        },
      }));
    }

    return c.json({
      message: "Chunks retrieved successfully",
      results,
    });
  } catch (error) {
    console.error("Error searching chunks:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
};

export const handleListDocuments = async (c: Context) => {
  try {
    const query = await c.req.query();
    const page = query.page ? parseInt(query.page) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize) : 10;
    const folder_id = query.folder_id;
    const file_id = query.file_id;

    // Validate pagination parameters
    const pageNum = Math.max(1, page);
    const limit = Math.max(1, Math.min(100, pageSize)); // Cap at 100 items per page
    const offset = (pageNum - 1) * limit;

    // Build where clause based on filters
    const whereConditions = [];
    if (folder_id) whereConditions.push(eq(dataset.folder_id, folder_id));
    if (file_id) whereConditions.push(eq(dataset.file_id, file_id));

    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql<number>`count(distinct ${dataset.file_id})` })
      .from(dataset)
      .where(whereClause);

    const totalCount = totalCountResult[0].count;
    const totalPages = Math.ceil(totalCount / limit);

    // Get distinct documents with first chunk for preview
    const documents = await db
      .select({
        file_id: dataset.file_id,
        folder_id: dataset.folder_id,
        content_preview: dataset.content,
        context_preview: dataset.context,
      })
      .from(dataset)
      .where(whereClause)
      .groupBy(
        dataset.file_id,
        dataset.folder_id,
        dataset.content,
        dataset.context
      )
      .limit(limit)
      .offset(offset);

    return c.json({
      message: "Documents retrieved successfully",
      data: documents,
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        total_items: totalCount,
        page_size: limit,
      },
    });
  } catch (error) {
    console.error("Error listing documents:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
};

export const handleDeleteChunks = async (c: Context) => {
  try {
    const { file_id } = await c.req.json();

    if (!file_id) {
      return c.json({ error: "file_id is required" }, 400);
    }

    // Delete chunks associated with the file_id
    const deleted = await db
      .delete(dataset)
      .where(eq(dataset.file_id, file_id));

    if (deleted.rowsAffected === 0) {
      return c.json({ error: "No chunks found for this file_id" }, 404);
    }

    return c.json({
      message: "Chunks deleted successfully",
      file_id,
    });
  } catch (error) {
    console.error("Error deleting chunks:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
};
