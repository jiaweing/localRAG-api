import { getLlama } from "node-llama-cpp";
import path from "path";
import { EMBEDDING_MODEL } from "./config";

interface ModelContext {
  model: Awaited<ReturnType<typeof getLlama.prototype.loadModel>>;
  context: any;
}

const modelContexts = new Map<string, ModelContext>();

export async function initEmbeddingModel(modelName: string = EMBEDDING_MODEL) {
  if (modelContexts.has(modelName)) return;

  const llama = await getLlama();
  const modelPath = path.join(
    process.cwd(),
    "models",
    "embedding",
    modelName.endsWith(".gguf") ? modelName : `${modelName}.gguf`
  );
  const model = await llama.loadModel({
    modelPath,
  });
  const context = await model.createEmbeddingContext();

  modelContexts.set(modelName, { model, context });
}

export async function getEmbedding(
  text: string,
  model: string = EMBEDDING_MODEL
): Promise<number[]> {
  if (!modelContexts.has(model)) {
    await initEmbeddingModel(model);
  }

  const context = modelContexts.get(model)?.context;
  if (!context) {
    throw new Error(`Failed to initialize embedding model: ${model}`);
  }

  const embedding = await context.getEmbeddingFor(text);
  return [...embedding.vector];
}
