import type { Context } from "hono";
import { loadModel } from "./models";
import type { RankedResult } from "./types";

interface Chunk {
  content: string;
  metadata?: Record<string, any>;
}

interface ChunkWithScore extends Chunk {
  score: number;
}

// Function to split text into chunks with overlap
function splitIntoChunks(text: string, chunkSize = 500, overlap = 50): Chunk[] {
  const chunks: Chunk[] = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push({
      content: chunkWords.join(" "),
      metadata: {
        start_idx: i,
        end_idx: i + chunkWords.length,
      },
    });
  }

  return chunks;
}

// Generate embeddings for chunks
async function generateEmbeddings(model: string, chunks: Chunk[]) {
  const modelContext = await loadModel(model, "embedding");
  if (!modelContext.embeddingContext) {
    throw new Error("Model is not suitable for embeddings");
  }

  const results = [];
  for (const chunk of chunks) {
    const embedding = await modelContext.embeddingContext.getEmbeddingFor(
      chunk.content
    );
    results.push({
      ...chunk,
      embedding: [...embedding.vector],
    });
  }

  return results;
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find similar chunks using embeddings
async function findSimilarChunks(
  queryEmbedding: number[],
  chunks: (Chunk & { embedding: number[] })[]
): Promise<ChunkWithScore[]> {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score);
}

// Rerank chunks using specified model
async function rerankChunks(
  query: string,
  chunks: ChunkWithScore[],
  model: string,
  topK: number
): Promise<ChunkWithScore[]> {
  const modelContext = await loadModel(model, "reranker");
  if (!modelContext.rankingContext) {
    throw new Error("Model is not suitable for reranking");
  }

  const rankedResults: RankedResult[] =
    await modelContext.rankingContext.rankAndSort(
      query,
      chunks.map((chunk) => chunk.content)
    );

  return rankedResults
    .map((result, idx) => ({
      ...chunks[idx],
      score: result.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Handler for chunking documents
export async function handleDocumentChunking(c: Context) {
  try {
    const { text, model, chunkSize = 500, overlap = 50 } = await c.req.json();

    if (!text || !model) {
      return c.json(
        {
          error: {
            message: "Missing required parameters: text, model",
            type: "invalid_request_error",
            param: !text ? "text" : "model",
            code: null,
          },
        },
        400
      );
    }

    const chunks = splitIntoChunks(text, chunkSize, overlap);
    const chunksWithEmbeddings = await generateEmbeddings(model, chunks);

    return c.json({
      chunks: chunksWithEmbeddings,
    });
  } catch (error) {
    console.error("Error processing document:", error);
    return c.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
          type: "server_error",
          param: null,
          code: null,
        },
      },
      500
    );
  }
}

// Handler for querying chunks
export async function handleQueryChunks(c: Context) {
  try {
    const {
      query,
      chunks,
      embeddingModel,
      rerankerModel,
      topK = 4,
      shouldRerank = true,
    } = await c.req.json();

    if (!query || !chunks || !embeddingModel) {
      return c.json(
        {
          error: {
            message:
              "Missing required parameters: query, chunks, embeddingModel",
            type: "invalid_request_error",
            param: !query ? "query" : !chunks ? "chunks" : "embeddingModel",
            code: null,
          },
        },
        400
      );
    }

    // Generate embedding for query
    const modelContext = await loadModel(embeddingModel, "embedding");
    if (!modelContext.embeddingContext) {
      throw new Error("Model is not suitable for embeddings");
    }

    const queryEmbedding = await modelContext.embeddingContext.getEmbeddingFor(
      query
    );

    // Find similar chunks
    const similarChunks = await findSimilarChunks(
      [...queryEmbedding.vector],
      chunks
    );

    // Rerank if specified
    if (shouldRerank && rerankerModel) {
      const rerankedChunks = await rerankChunks(
        query,
        similarChunks,
        rerankerModel,
        topK
      );

      return c.json({
        results: rerankedChunks.map(({ content, metadata, score }) => ({
          content,
          metadata,
          score,
        })),
      });
    }

    return c.json({
      results: similarChunks
        .slice(0, topK)
        .map(({ content, metadata, score }) => ({
          content,
          metadata,
          score,
        })),
    });
  } catch (error) {
    console.error("Error querying chunks:", error);
    return c.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
          type: "server_error",
          param: null,
          code: null,
        },
      },
      500
    );
  }
}
