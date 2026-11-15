import { llm, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./llmClient.js";

const BATCH_SIZE = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(inputs) {
  // one retry on rate limit / overload (the free tier has limits)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await llm.embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    } catch (err) {
      if (attempt >= 2 || ![429, 503].includes(err.status)) throw err;
      await sleep(3000);
    }
  }
}

// Turns many texts into vectors (arrays of numbers that capture meaning).
export async function embedTexts(texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE))));
  }
  return vectors;
}

// IMPORTANT: questions must be embedded with the SAME model as the chunks.
export async function embedQuery(text) {
  return (await embedTexts([text]))[0];
}