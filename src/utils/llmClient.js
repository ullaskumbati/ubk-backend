import OpenAI from "openai";
 
// One shared client. Key and model come from .env (never hardcode them).
export const llm = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || undefined,
});
 
export const LLM_MODEL = process.env.LLM_MODEL || "gemini-flash-latest";
 