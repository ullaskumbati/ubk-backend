import { ApiError } from "../utils/ApiError.js";
 
const BASE = "https://api.spoonacular.com";
 
const call = async (path, params = {}) => {
  const url = new URL(BASE + path);
  url.search = new URLSearchParams({
    ...params,
    apiKey: process.env.SPOONACULAR_KEY,
  });
 
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 402) {
      throw new ApiError(503, "Recipe service quota exhausted. Try later.");
    }
    throw new ApiError(502, "Recipe service error");
  }
  return res.json();
};
 
// ---- trimmers: keep only what the UI needs ----
 
const pickMacros = (nutrition) => {
  const find = (name) =>
    nutrition?.nutrients?.find((n) => n.name === name)?.amount;
  const round = (v) => (v == null ? null : Math.round(v));
  return {
    calories: round(find("Calories")),
    protein: round(find("Protein")),
    carbs: round(find("Carbohydrates")),
    fat: round(find("Fat")),
  };
};
 
const trimIngredient = (i) => ({
  id: i.id,
  name: i.name,
  amount: i.amount,
  unit: i.unit,
  image: i.image,
});
 
const trimSearchResult = (r) => ({
  id: r.id,
  title: r.title,
  image: r.image,
  readyInMinutes: r.readyInMinutes ?? null,
  servings: r.servings ?? null,
  usedIngredientCount: r.usedIngredientCount ?? r.usedIngredients?.length ?? 0,
  missedIngredientCount:
    r.missedIngredientCount ?? r.missedIngredients?.length ?? 0,
  usedIngredients: (r.usedIngredients || []).map(trimIngredient),
  missedIngredients: (r.missedIngredients || []).map(trimIngredient),
  nutrition: pickMacros(r.nutrition), // per serving
});
 
const trimRecipeDetail = (r) => ({
  id: r.id,
  title: r.title,
  image: r.image,
  readyInMinutes: r.readyInMinutes,
  servings: r.servings,
  sourceUrl: r.sourceUrl,
  diets: r.diets || [],
  ingredients: (r.extendedIngredients || []).map((i) => ({
    id: i.id,
    name: i.name,
    original: i.original,
  })),
  steps: (r.analyzedInstructions?.[0]?.steps || []).map((s) => ({
    number: s.number,
    step: s.step,
  })),
  nutrition: pickMacros(r.nutrition),
});
 
// ---- API calls (return trimmed data, so the cache stores the small version) ----
 
const FETCH_COUNT = 30; // candidates pulled from Spoonacular
const RETURN_COUNT = 12; // best matches sent to the UI
// Nutrition on 30 results costs extra points; the detail page still has full macros.
const NUTRITION_IN_SEARCH = false;
 
// How well does a recipe fit what the user actually has?
//  coverage = share of the user's ingredients the recipe uses
//  fit      = share of the recipe's ingredients the user already has
const scoreRecipe = (r, wanted) => {
  const used = r.usedIngredientCount;
  const total = used + r.missedIngredientCount;
  const coverage = wanted ? Math.min(used / wanted, 1) : 0;
  const fit = total ? used / total : 0;
  return 0.6 * coverage + 0.4 * fit;
};
 
const searchRecipes = async ({ ingredients, cuisines, diet, intolerances }) => {
  const data = await call("/recipes/complexSearch", {
    includeIngredients: ingredients.join(","),
    ...(cuisines.length && { cuisine: cuisines.join(",") }),
    ...(diet && { diet }),
    ...(intolerances.length && { intolerances: intolerances.join(",") }),
    fillIngredients: true,
    ...(NUTRITION_IN_SEARCH && { addRecipeNutrition: true }),
    ignorePantry: true, // don't count salt, water, oil etc. as "missing"
    sort: "max-used-ingredients",
    number: FETCH_COUNT,
  });
 
  const wanted = ingredients.length;
  let results = (data.results || []).map(trimSearchResult);
 
  // drop recipes that barely use what the user has (keep them only if nothing else is left)
  const minUsed = Math.min(2, wanted);
  const strong = results.filter((r) => r.usedIngredientCount >= minUsed);
  if (strong.length) results = strong;
 
  results = results
    .map((r) => ({ ...r, matchScore: scoreRecipe(r, wanted) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, RETURN_COUNT);
 
  return { totalResults: data.totalResults, results };
};
 
const getRecipe = async (id) =>
  trimRecipeDetail(await call(`/recipes/${id}/information`, { includeNutrition: true }));
 
const autocompleteIngredients = async (query) => {
  const data = await call("/food/ingredients/autocomplete", { query, number: 8 });
  return data.map((i) => ({ id: i.id, name: i.name }));
};
 
export { searchRecipes, getRecipe, autocompleteIngredients };