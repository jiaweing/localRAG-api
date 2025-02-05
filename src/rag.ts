import type { Context } from "hono";
import { loadModel } from "./models";

import OpenAI from "openai";
import { createChatCompletion } from "./chat";
import { DEFAULT_CHAT_MODEL, OPENAI_CONFIG } from "./config";
import { Chunk, ChunkWithScore } from "./types.js";

// Try to initialize OpenAI if configured
let openai: OpenAI | undefined;
if (OPENAI_CONFIG.apiKey) {
  openai = new OpenAI({
    apiKey: OPENAI_CONFIG.apiKey,
  });
}

// Generate context using either OpenAI or local model
export async function generateContext(
  chunk: string,
  document: string,
  useOpenAI = false
): Promise<string> {
  const prompt = `<document>
${document}
</document>
Here is the chunk we want to situate within the whole document
<chunk>
${chunk}
</chunk>
Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

  if (useOpenAI && openai) {
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 200,
    });
    return response.choices[0].message.content?.trim() || "";
  }

  const result = await createChatCompletion({
    model: DEFAULT_CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 200,
  });

  return result.choices[0].message.content.trim();
}

// Function to split text into chunks with overlap
export async function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 50,
  generateContexts = false,
  useOpenAI = false
): Promise<ChunkWithScore[]> {
  const chunks: ChunkWithScore[] = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push({
      content: chunkWords.join(" "),
      context: "",
      metadata: {
        file_id: "", // Will be set later
        folder_id: null,
      },
      scores: {
        content: 0,
        context: 0,
        combined: 0,
      },
    });
  }

  if (generateContexts) {
    // Generate context for each chunk
    for (const chunk of chunks) {
      chunk.context = await generateContext(chunk.content, text, useOpenAI);
    }
  }
  return chunks;
}

import { getEmbedding } from "./embeddings.js";

// Generate embeddings for chunks
async function generateEmbeddings(model: string, chunks: Chunk[]) {
  const results = [];
  for (const chunk of chunks) {
    // Generate embeddings for both content and context
    const contentEmbedding = await getEmbedding(chunk.content, model);
    const contextEmbedding = chunk.context
      ? await getEmbedding(chunk.context, model)
      : undefined;

    results.push({
      ...chunk,
      content_embedding: contentEmbedding,
      context_embedding: contextEmbedding,
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

// Find similar chunks using embeddings with combined scoring
async function findSimilarChunks(
  queryEmbedding: number[],
  chunks: ChunkWithScore[]
): Promise<ChunkWithScore[]> {
  return chunks
    .map((chunk) => {
      if (!chunk.content_embedding) {
        throw new Error("Chunk missing content embedding");
      }

      const contentScore = cosineSimilarity(
        queryEmbedding,
        chunk.content_embedding
      );
      let contextScore = 0;

      if (chunk.context_embedding) {
        contextScore = cosineSimilarity(
          queryEmbedding,
          chunk.context_embedding
        );
      }

      // Weighted combination (0.6 content, 0.4 context)
      const combinedScore = chunk.context_embedding
        ? 0.6 * contentScore + 0.4 * contextScore
        : contentScore;

      return {
        ...chunk,
        scores: {
          content: contentScore,
          context: chunk.context_embedding ? contextScore : undefined,
          combined: combinedScore,
        },
      };
    })
    .sort((a, b) => b.scores.combined - a.scores.combined);
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

  const rankedResults = await modelContext.rankingContext.rankAndSort(
    query,
    chunks.map((chunk) => chunk.content)
  );

  return rankedResults
    .map((result, idx) => ({
      ...chunks[idx],
      scores: {
        ...chunks[idx].scores,
        reranked: result.score,
      },
    }))
    .sort(
      (a, b) =>
        (b.scores.reranked ?? b.scores.combined) -
        (a.scores.reranked ?? a.scores.combined)
    )
    .slice(0, topK);
}

// Handler for chunking documents
export async function handleDocumentChunking(c: Context) {
  try {
    const {
      text,
      model,
      chunkSize = 500,
      overlap = 50,
      generateContexts = false,
      useOpenAI = false,
    } = await c.req.json();

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

    // Validate OpenAI usage
    if (useOpenAI && !openai) {
      return c.json(
        {
          error: {
            message:
              "OpenAI API key not configured. Set OPENAI_API_KEY in .env file or disable useOpenAI option.",
            type: "configuration_error",
            param: "useOpenAI",
            code: null,
          },
        },
        400
      );
    }

    const chunks = await splitIntoChunks(
      text,
      chunkSize,
      overlap,
      generateContexts,
      useOpenAI
    );
    const chunksWithEmbeddings = await generateEmbeddings(model, chunks);

    return c.json({
      chunks: chunksWithEmbeddings.map((chunk) => ({
        ...chunk,
        content_embedding: chunk.content_embedding,
        context_embedding: chunk.context_embedding,
        metadata: {
          ...chunk.metadata,
          has_context: !!chunk.context,
        },
      })),
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
    const queryEmbedding = await getEmbedding(query, embeddingModel);

    // Find similar chunks
    const similarChunks = await findSimilarChunks(
      queryEmbedding,
      chunks.map((chunk: ChunkWithScore) => ({
        ...chunk,
        content_embedding: chunk.content_embedding,
        context_embedding: chunk.context_embedding,
      }))
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
        results: rerankedChunks.map(
          ({ content, context, metadata, scores }) => ({
            content,
            context,
            metadata,
            scores: {
              ...scores,
            },
          })
        ),
      });
    }

    return c.json({
      results: similarChunks
        .slice(0, topK)
        .map(({ content, context, metadata, scores }) => ({
          content,
          context,
          metadata,
          scores,
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
