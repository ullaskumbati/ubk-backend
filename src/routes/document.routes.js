import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadDocument, listDocuments, deleteDocument } from "../controllers/document.controller.js";

const router = Router();

// keep the file in memory (we only need its text), max 10 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// turn multer errors into your normal ApiError responses
const uploadSingle = (req, res, next) =>
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10 MB)" : err.message;
    next(new ApiError(400, msg));
  });

router.route("/").get(verifyJwt, listDocuments);
router.route("/upload").post(verifyJwt, uploadSingle, uploadDocument);
router.route("/:id").delete(verifyJwt, deleteDocument);

export default router;