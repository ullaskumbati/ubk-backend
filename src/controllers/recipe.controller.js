import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { cache } from "../utils/cache.js";
import { normalizeList, makeKey } from "../utils/normalize.js";
import { consumeQuota, getQuota } from "../utils/dailyQuota.js";
import * as spoonacular from "../utils/Spoonacular.js";

const TTL = {
  search: 6 * 60 * 60, // 6 hours
  recipe: 7 * 24 * 60 * 60, // 7 days
  autocomplete: 24 * 60 * 60, // 1 day
};

// GET /search?ingredients=chicken,rice&cuisine=Asian,Mexican&diet=vegan&intolerances=gluten
const searchRecipes = asyncHandler(async (req, res) => {
  const ingredients = normalizeList(req.query.ingredients, {
    singularize: true,
  });
  if (!ingredients.length) {
    throw new ApiError(400, "ingredients is required");
  }
  if (ingredients.length > 15) {
    throw new ApiError(400, "Maximum 15 ingredients allowed");
  }

  const cuisines = normalizeList(req.query.cuisine);
  const intolerances = normalizeList(req.query.intolerances);
  const diet = String(req.query.diet || "")
    .toLowerCase()
    .trim();

  // shared across all users: one user's search warms the cache for everyone
  const key = makeKey("search", { ingredients, cuisines, diet, intolerances });

  const { data, cached } = await cache.wrap(key, TTL.search, async () => {
    consumeQuota(String(req.user._id)); // charged only on a real API call
    return spoonacular.searchRecipes({
      ingredients,
      cuisines,
      diet,
      intolerances,
    });
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ...data, cached, quota: getQuota(String(req.user._id)) },
        "Recipes fetched successfully"
      )
    );
});

// GET /:recipeId
const getRecipeById = asyncHandler(async (req, res) => {
  const { recipeId } = req.params;
  if (!/^\d+$/.test(recipeId)) {
    throw new ApiError(400, "Invalid recipe id");
  }

  const { data, cached } = await cache.wrap(
    `recipe:${recipeId}`,
    TTL.recipe,
    async () => {
      consumeQuota(String(req.user._id));
      return spoonacular.getRecipe(recipeId);
    }
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, { ...data, cached }, "Recipe fetched successfully")
    );
});

// GET /ingredients/autocomplete?q=chi
const autocompleteIngredients = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  if (q.length < 2) {
    return res.status(200).json(new ApiResponse(200, [], "Query too short"));
  }

  const { data } = await cache.wrap(`ac:${q}`, TTL.autocomplete, () =>
    spoonacular.autocompleteIngredients(q)
  );

  return res
    .status(200)
    .json(new ApiResponse(200, data, "Suggestions fetched successfully"));
});

// GET /quota
const getSearchQuota = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        getQuota(String(req.user._id)),
        "Quota fetched successfully"
      )
    );
});

export {
  searchRecipes,
  getRecipeById,
  autocompleteIngredients,
  getSearchQuota,
};
