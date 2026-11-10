import { Router } from "express";
import { getCountryAnalytics } from "../controllers/country.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js"; // Optional: keep it secure behind your existing auth middleware

const router = Router();

// Secured route matching your project style
router.route("/").get(verifyJwt, getCountryAnalytics);

export default router;