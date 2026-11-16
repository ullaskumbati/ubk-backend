import mongoose from "mongoose";
import { Document } from "../models/document.model.js";
import { DocumentChunk } from "../models/documentChunk.model.js";
import { embedQuery } from "./embeddings.js";

const TOP_K = Number(process.env.RAG_TOP_K || 4);
const MIN_SCORE = Number(process.env.RAG_MIN_SCORE || 0.4);
const INDEX_NAME = process.env.VECTOR_INDEX_NAME || "chunk_vector_index";

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

// Search INSIDE the database using the Atlas vector index (fast, scales to many chunks).
async function atlasVectorSearch(userId, queryVector) {
  const rows = await DocumentChunk.aggregate([
    {
      $vectorSearch: {
        index: INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: 100, // how many nearest candidates Atlas examines
        limit: TOP_K,
        filter: { userId: new mongoose.Types.ObjectId(userId) }, // only THIS user's chunks
      },
    },
    { $project: { _id: 0, fileName: 1, page: 1, text: 1, atlasScore: { $meta: "vectorSearchScore" } } },
  ]);

  // Atlas reports cosine as (1 + cosine) / 2. Convert back so MIN_SCORE keeps the same meaning.
  return rows.map((r) => ({
    fileName: r.fileName,
    page: r.page,
    text: r.text,
    score: 2 * r.atlasScore - 1,
  }));
}

// Fallback: load the user's chunks and compare in Node (the original approach).
async function bruteForceSearch(userId, queryVector) {
  const all = await DocumentChunk.find({ userId })
    .select("+embedding fileName page text")
    .lean();

  return all
    .map((c) => ({
      fileName: c.fileName,
      page: c.page,
      text: c.text,
      score: cosineSimilarity(queryVector, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

// Finds the chunks (from THIS user's documents only) closest in meaning to the question.
export async function retrieveChunks(userId, question) {
  const hasDocs = await Document.exists({ userId });
  if (!hasDocs) return { hasDocs: false, chunks: [] };

  const queryVector = await embedQuery(question);

  let scored = [];
  let method = "atlas";
  try {
    scored = await atlasVectorSearch(userId, queryVector);
    // The user has documents, so an empty result usually means the index isn't ready yet.
    if (!scored.length) throw new Error("vector search returned no results");
  } catch (err) {
    console.warn("Atlas vector search unavailable, using brute force:", err.message);
    method = "brute-force";
    scored = await bruteForceSearch(userId, queryVector);
  }

  console.log(`RAG scores (${method}):`, scored.map((c) => c.score.toFixed(2)).join(", "));

  return { hasDocs: true, chunks: scored.filter((c) => c.score >= MIN_SCORE) };
}