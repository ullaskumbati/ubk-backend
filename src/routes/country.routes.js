import { Router } from "express";
import { getCountryAnalytics } from "../controllers/country.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js"; // Optional: keep it secure behind your existing auth middleware

const router = Router();

// Secured route matching your project style
router.route("/").get(verifyJWT, getCountryAnalytics);

export default router;