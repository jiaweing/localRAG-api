import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 57352;

// OpenAI Configuration
export const OPENAI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.OPENAI_MODEL_NAME || "gpt-4-turbo-preview",
};

// Default Models
export const DEFAULT_CHAT_MODEL = "Llama-3.2-1B-Instruct-Q4_K_M";
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "all-MiniLM-L6-v2.Q4_K_M.gguf";

// PostgreSQL Configuration
export const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/localrag";
