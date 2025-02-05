import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { PORT } from "./config";
import {
  handleDeleteChunks,
  handleSearchChunks,
  handleStoreDocument,
} from "./db-rag";
import {
  initializeModelDirectories,
  listModels,
  loadModel,
  unloadModel,
} from "./models";
import { handleDocumentChunking, handleQueryChunks } from "./rag";

// Initialize model directories
await initializeModelDirectories();

const app = new Hono();

app.get("/", (c) => {
  return c.text("Local RAG API Service");
});

// In-memory RAG endpoints
app.post("/v1/chunk", handleDocumentChunking);
app.post("/v1/query", handleQueryChunks);

// Database-backed RAG endpoints
app.post("/v1/store", handleStoreDocument);
app.post("/v1/retrieve", handleSearchChunks);
app.post("/v1/delete", handleDeleteChunks);

// Model management endpoints
app.post("/v1/models/load", async (c) => {
  try {
    const { model, type } = await c.req.json();

    if (!model || !type) {
      return c.json(
        { error: "Model name and type (embedding or reranker) are required" },
        400
      );
    }

    if (type !== "embedding" && type !== "reranker" && type !== "chat") {
      return c.json(
        { error: "Type must be either 'embedding', 'reranker', or 'chat'" },
        400
      );
    }

    await loadModel(model, type);
    return c.json({ message: "Model loaded successfully" });
  } catch (error: unknown) {
    console.error("Error loading model:", error);
    if (
      error instanceof Error &&
      "code" in error &&
      (error as any).code === "ENOENT"
    ) {
      return c.json(
        {
          error: `Model '${(error as any).path}' not found in models directory`,
        },
        404
      );
    }
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
});

app.post("/v1/models/unload", async (c) => {
  try {
    const { model } = await c.req.json();

    if (!model) {
      return c.json({ error: "Model name is required" }, 400);
    }

    const success = await unloadModel(model);
    if (!success) {
      return c.json({ error: "Model not found or not loaded" }, 404);
    }

    return c.json({ message: "Model unloaded successfully" });
  } catch (error) {
    console.error("Error unloading model:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
});

app.get("/v1/models", async (c) => {
  try {
    const models = await listModels();
    return c.json(models);
  } catch (error) {
    console.error("Error listing models:", error);
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
});

console.log(`Local LLM Service is running on http://localhost:${PORT}`);

serve({
  fetch: app.fetch,
  port: Number(PORT),
});
