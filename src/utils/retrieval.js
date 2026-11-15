import { Document } from "../models/document.model.js";
import { DocumentChunk } from "../models/documentChunk.model.js";
import { embedQuery } from "./embeddings.js";

const TOP_K = Number(process.env.RAG_TOP_K || 4);
const MIN_SCORE = Number(process.env.RAG_MIN_SCORE || 0.4);

// How close two vectors point in the same direction: ~1 = same meaning, ~0 = unrelated.
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// Finds the chunks (from THIS user's documents only) closest in meaning to the question.
export async function retrieveChunks(userId, question) {
  const hasDocs = await Document.exists({ userId });
  if (!hasDocs) return { hasDocs: false, chunks: [] };

  const queryVector = await embedQuery(question);

  // Fine for a few hundred chunks. For more, switch to MongoDB Atlas Vector Search.
  const all = await DocumentChunk.find({ userId })
    .select("+embedding fileName page text")
    .lean();

  const scored = all
    .map((c) => ({
      fileName: c.fileName,
      page: c.page,
      text: c.text,
      score: cosineSimilarity(queryVector, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  console.log("RAG scores:", scored.map((c) => c.score.toFixed(2)).join(", ")); // helps tune MIN_SCORE

  return { hasDocs: true, chunks: scored.filter((c) => c.score >= MIN_SCORE) };
}