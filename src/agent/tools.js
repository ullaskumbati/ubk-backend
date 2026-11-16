import { retrieveChunks } from "../utils/retrieval.js";
import { cache } from "../utils/cache.js";
import { normalizeList, makeKey } from "../utils/Normalize.js";
import { consumeQuota } from "../utils/dailyQuota.js";
import * as spoonacular from "../utils/Spoonacular.js";

const RECIPE_TTL = 6 * 60 * 60; // search results: 6 hours (same as your recipe controller)
const RECIPE_DETAIL_TTL = 7 * 24 * 60 * 60; // single recipe: 7 days (same as your controller)
const MAX_TOOL_OUTPUT = 6000; // characters, so one tool can't flood the context window
const MAX_RECIPES_FOR_MODEL = 6; // your search returns up to 12; the model only needs the best few

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
  {
    type: "function",
    function: {
      name: "getRecipeDetails",
      description:
        "Get the full ingredients, cooking steps and nutrition of ONE recipe. " +
        "Use this when the user asks how to make a recipe, using the numeric id from a searchRecipes result.",
      parameters: {
        type: "object",
        properties: {
          recipeId: { type: "string", description: "The numeric recipe id from a searchRecipes result, for example '654959'." },
        },
        required: ["recipeId"],
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

  return formatSearchResults(data);
}

// Turns your Spoonacular result into a short, clean list for the model
// (no image URLs, no nutrition blobs, just what it needs to answer and to call getRecipeDetails).
function formatSearchResults(data) {
  const list = (data?.results || []).slice(0, MAX_RECIPES_FOR_MODEL);
  if (!list.length) return "No recipes found for these ingredients.";

  const names = (arr) => (arr || []).map((i) => i.name).join(", ") || "none";
  const lines = list.map(
    (r, i) =>
      `${i + 1}. ${r.title} (id ${r.id}) | ready in ${r.readyInMinutes ?? "?"} min | ` +
      `uses: ${names(r.usedIngredients)} | missing: ${names(r.missedIngredients)}`
  );
  const total = data.totalResults ?? list.length;
  return `Top ${list.length} of ${total} matching recipes, best match first:\n${lines.join("\n")}`;
}

function formatRecipe(r) {
  const ingredients = (r.ingredients || []).map((i) => `- ${i.original || i.name}`).join("\n");
  const steps = (r.steps || []).map((s) => `${s.number}. ${s.step}`).join("\n");
  const n = r.nutrition || {};
  const nutrition = n.calories != null
    ? `Per serving: ${n.calories} kcal, ${n.protein ?? "?"} g protein, ${n.carbs ?? "?"} g carbs, ${n.fat ?? "?"} g fat`
    : null;

  const text = [
    `${r.title} (id ${r.id})`,
    `Ready in ${r.readyInMinutes ?? "?"} min, serves ${r.servings ?? "?"}`,
    r.diets?.length ? `Diets: ${r.diets.join(", ")}` : null,
    nutrition,
    `Ingredients:\n${ingredients || "not available"}`,
    `Steps:\n${steps || "No step-by-step instructions are available for this recipe."}`,
    r.sourceUrl ? `Source: ${r.sourceUrl}` : null,
  ].filter(Boolean).join("\n\n");

  return text.length > MAX_TOOL_OUTPUT ? text.slice(0, MAX_TOOL_OUTPUT) + " ...[truncated]" : text;
}

async function getRecipeDetails(args, ctx) {
  const id = String(args.recipeId ?? "").trim();
  if (!/^\d+$/.test(id)) return "Error: recipeId must be a numeric id taken from a searchRecipes result.";

  // same cache key as your REST endpoint (GET /recipes/:recipeId)
  const { data } = await cache.wrap(`recipe:${id}`, RECIPE_DETAIL_TTL, async () => {
    consumeQuota(String(ctx.userId));
    return spoonacular.getRecipe(id);
  });
  return formatRecipe(data);
}

const EXECUTORS = { searchDocuments, searchRecipes, getRecipeDetails };

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