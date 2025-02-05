import {
  LlamaEmbeddingContext,
  LlamaModel,
  LlamaRankingContext,
} from "node-llama-cpp";

// Add missing methods to LlamaModel
declare module "node-llama-cpp" {
  interface LlamaModel {
    createChat(messages: Array<{ role: string; content: string }>): Promise<{
      message: { content: string };
    }>;
  }

  interface LlamaEmbeddingContext {
    getEmbedding(text: string): Promise<{
      embedding: number[];
    }>;
  }

  interface LlamaRankingContext {
    rank(
      query: string,
      documents: string[]
    ): Promise<
      Array<{
        document: string;
        score: number;
      }>
    >;
  }
}

export type ModelType = "chat" | "embedding" | "reranker";

export interface ModelContext {
  model: LlamaModel;
  embeddingContext?: LlamaEmbeddingContext;
  rankingContext?: LlamaRankingContext;
  lastUsed: number;
}

export interface Chunk {
  content: string;
  context?: string;
  content_embedding?: number[];
  context_embedding?: number[];
  metadata: Record<string, any>;
}

export interface ChunkWithScore extends Omit<Chunk, "metadata"> {
  metadata: {
    file_id: string;
    folder_id?: string | null;
  };
  scores: {
    content: number;
    context?: number;
    combined: number;
    reranked?: number;
  };
}

export interface RankedResult {
  document: string;
  score: number;
}

export const MODEL_DIRS: Record<ModelType, string> = {
  chat: "./models/chat",
  embedding: "./models/embedding",
  reranker: "./models/reranker",
} as const;
