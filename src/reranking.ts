import { getLlama } from "node-llama-cpp";
import path from "path";

let rerankerModel: Awaited<
  ReturnType<typeof getLlama.prototype.loadModel>
> | null = null;
let rerankerContext: any | null = null;

export async function initRerankerModel() {
  if (rerankerModel) return;

  const llama = await getLlama();
  rerankerModel = await llama.loadModel({
    modelPath: path.join(
      process.cwd(),
      "models",
      "reranker",
      "bge-reranker-v2-m3-Q8_0.gguf"
    ),
  });
  rerankerContext = await rerankerModel.createRankingContext();
}

interface RankedChunk {
  text: string;
  score: number;
}

export async function rerankChunks(
  query: string,
  chunks: string[],
  modelName: string // Not used in this implementation but kept for API compatibility
): Promise<RankedChunk[]> {
  if (!rerankerContext) {
    await initRerankerModel();
  }

  if (!rerankerContext) {
    throw new Error("Failed to initialize reranker model");
  }

  const rankedResults = await rerankerContext.rankAndSort(query, chunks);

  return rankedResults.map((result: { document: string; score: number }) => ({
    text: result.document,
    score: result.score,
  }));
}
