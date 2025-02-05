import { getLlama } from "node-llama-cpp";
import path from "path";

let embeddingModel: Awaited<
  ReturnType<typeof getLlama.prototype.loadModel>
> | null = null;
let embeddingContext: any | null = null;

export async function initEmbeddingModel() {
  if (embeddingModel) return;

  const llama = await getLlama();
  embeddingModel = await llama.loadModel({
    modelPath: path.join(
      process.cwd(),
      "models",
      "embedding",
      "all-MiniLM-L6-v2.Q4_K_M.gguf"
    ),
  });
  embeddingContext = await embeddingModel.createEmbeddingContext();
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingContext) {
    await initEmbeddingModel();
  }

  if (!embeddingContext) {
    throw new Error("Failed to initialize embedding model");
  }

  const embedding = await embeddingContext.getEmbeddingFor(text);
  return [...embedding.vector];
}
