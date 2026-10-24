import { Router } from "express";
import {
  searchRecipes,
  getRecipeById,
  autocompleteIngredients,
  getSearchQuota,
} from "../controllers/recipe.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
const router = Router();
 
//secured routes
 
router.route("/search").get(verifyJwt, searchRecipes);
router.route("/quota").get(verifyJwt, getSearchQuota);
router
  .route("/ingredients/autocomplete")
  .get(verifyJwt, autocompleteIngredients);
 
// keep dynamic route last so it doesn't swallow the static ones above
router.route("/:recipeId").get(verifyJwt, getRecipeById);
 
export default router;