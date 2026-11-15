import OpenAI from "openai";

// One shared client for chat AND embeddings. Key and URL come from .env.
export const llm = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || undefined,
  timeout: 30_000, // fail fast instead of hanging for 10 minutes
  maxRetries: 0,
});

// Comma-separated list. The first is tried first, the others are fallbacks.
export const LLM_MODELS = (process.env.LLM_MODELS || process.env.LLM_MODEL || "gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 768);