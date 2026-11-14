import { Router } from "express";
import { chatWithLLM } from "../controllers/chat.controller.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
const router = Router();
 
// Later: add your auth middleware here, e.g. router.post("/", verifyJWT, chatWithLLM)
router.route("/").post(verifyJwt, chatWithLLM);
 
export default router;