export interface RankedResult {
  document: string;
  score: number;
}

export interface Chunk {
  content: string;
  context?: string;
  content_embedding?: number[];
  context_embedding?: number[];
  metadata?: Record<string, any>;
}

export interface ChunkWithScore extends Chunk {
  scores: {
    content: number;
    context?: number;
    combined: number;
    reranked?: number;
  };
}
