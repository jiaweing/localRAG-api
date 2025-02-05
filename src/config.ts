import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 23673;

// OpenAI Configuration
export const OPENAI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.OPENAI_MODEL_NAME || "gpt-4-turbo-preview",
};

// Default Chat Model for Local Context Generation
export const DEFAULT_CHAT_MODEL = "Llama-3.2-1B-Instruct-Q4_K_M";

// PostgreSQL Configuration
export const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/localrag";
