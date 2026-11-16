import { retrieveChunks } from "../utils/retrieval.js";
import { cache } from "../utils/cache.js";
import { normalizeList, makeKey } from "../utils/Normalize.js";
import { consumeQuota } from "../utils/dailyQuota.js";
import * as spoonacular from "../utils/Spoonacular.js";

const RECIPE_TTL = 6 * 60 * 60; // same as your recipe controller: 6 hours
const MAX_TOOL_OUTPUT = 6000; // characters, so one tool can't flood the context window

// ---------------------------------------------------------------------------
// 1. What the LLM SEES: only names, descriptions and parameters (never your code).
//    The descriptions are what the model uses to decide WHICH tool to call.
// ---------------------------------------------------------------------------
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "searchDocuments",
      description:
        "Search the documents (PDFs) the user has uploaded, by meaning. " +
        "Use this when the user asks about the content of their documents, files, resume, notes or uploads.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to look for, written as a short, self-contained search query.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchRecipes",
      description:
        "Find recipes from the Spoonacular recipe database using ingredients the user has. " +
        "Use this when the user wants recipe ideas, or asks what they can cook with certain ingredients.",
      parameters: {
        type: "object",
        properties: {
          ingredients: {
            type: "string",
            description: "Comma-separated ingredients, for example 'chicken, rice'. Maximum 15.",
          },
          cuisine: { type: "string", description: "Optional comma-separated cuisines, for example 'Italian, Indian'." },
          diet: { type: "string", description: "Optional diet, for example 'vegetarian' or 'vegan'." },
          intolerances: { type: "string", description: "Optional comma-separated intolerances, for example 'gluten'." },
        },
        required: ["ingredients"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// 2. What YOUR CODE runs. The model only asks; we execute, validate and decide.
//    ctx.userId always comes from the logged-in user (req.user), NEVER from the model.
// ---------------------------------------------------------------------------
async function searchDocuments(args, ctx) {
  const query = String(args.query || "").trim().slice(0, 500);
  if (!query) return "Error: query is required.";

  const { hasDocs, chunks } = await retrieveChunks(ctx.userId, query);
  if (!hasDocs) return "The user has not uploaded any documents.";
  if (!chunks.length) return "No relevant excerpts were found in the user's documents.";

  return chunks
    .map((c) => {
      const n = ++ctx.sourceCounter; // keeps [Source n] labels unique across several calls
      if (!ctx.sources.some((s) => s.fileName === c.fileName && s.page === c.page)) {
        ctx.sources.push({ fileName: c.fileName, page: c.page });
      }
      return `[Source ${n}: ${c.fileName}, page ${c.page}]\n${c.text}`;
    })
    .join("\n\n");
}

async function searchRecipes(args, ctx) {
  // the model might send an array instead of a string, so accept both
  const asText = (v) => (Array.isArray(v) ? v.join(",") : v);

  const ingredients = normalizeList(asText(args.ingredients), { singularize: true });
  if (!ingredients.length) return "Error: at least one ingredient is required.";
  if (ingredients.length > 15) return "Error: a maximum of 15 ingredients is allowed.";

  const cuisines = normalizeList(asText(args.cuisine));
  const intolerances = normalizeList(asText(args.intolerances));
  const diet = String(args.diet || "").toLowerCase().trim();

  // same cache key as your REST endpoint, so both share the cache and save quota
  const key = makeKey("search", { ingredients, cuisines, diet, intolerances });
  const { data } = await cache.wrap(key, RECIPE_TTL, async () => {
    consumeQuota(String(ctx.userId)); // charged only on a real API call, like your controller
    return spoonacular.searchRecipes({ ingredients, cuisines, diet, intolerances });
  });

  return compact(data);
}

// TODO: I haven't seen the exact shape of what Spoonacular.js returns. Once you know it,
// trim it to the fields the model needs (title, id, ready time, used ingredients) instead.
function compact(data) {
  const text = JSON.stringify(data);
  return text.length > MAX_TOOL_OUTPUT ? text.slice(0, MAX_TOOL_OUTPUT) + " ...[truncated]" : text;
}

const EXECUTORS = { searchDocuments, searchRecipes };

// Runs one tool call safely. It always returns a STRING for the model, even on failure.
export async function executeTool(name, rawArgs, ctx) {
  const run = EXECUTORS[name];
  if (!run) return `Error: unknown tool "${name}".`;

  let args;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return "Error: the tool arguments were not valid JSON.";
  }

  try {
    return await run(args, ctx);
  } catch (err) {
    console.error(`Tool ${name} failed:`, err.message);
    // show the model only our own readable errors (like "daily limit reached"), not internals
    const safe = err.statusCode ? err.message : "an unexpected error occurred";
    return `Error: the ${name} tool failed (${safe}).`;
  }
}