import path from "path";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Document } from "../models/document.model.js";
import { DocumentChunk } from "../models/documentChunk.model.js";
import { extractPdfPages } from "../utils/pdfParser.js";
import { chunkText } from "../utils/chunker.js";
import { embedTexts } from "../utils/embeddings.js";

const MAX_DOCS_PER_USER = 5;
const MAX_CHUNKS_PER_DOC = 300; // protects your free embedding quota

// POST /documents/upload   (multipart form field name: "file")
const uploadDocument = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No file uploaded");

  // check the real content, not just the filename: PDFs start with "%PDF-"
  if (file.buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new ApiError(400, "Only PDF files are supported right now");
  }

  const userId = req.user._id;
  if ((await Document.countDocuments({ userId })) >= MAX_DOCS_PER_USER) {
    throw new ApiError(400, `You can keep up to ${MAX_DOCS_PER_USER} documents. Delete one first.`);
  }

  // 1. PARSE: PDF -> text per page
  let pages;
  try {
    pages = await extractPdfPages(file.buffer);
  } catch {
    throw new ApiError(422, "Could not read this PDF. It may be corrupted or password-protected.");
  }

  // 2. CHUNK: split each page (so every chunk keeps its page number for citations)
  const pieces = [];
  pages.forEach((pageText, i) => {
    chunkText(pageText).forEach((text) => pieces.push({ page: i + 1, text }));
  });

  if (!pieces.length) {
    throw new ApiError(422, "No readable text found. Scanned/image-only PDFs aren't supported yet.");
  }
  if (pieces.length > MAX_CHUNKS_PER_DOC) {
    throw new ApiError(400, "This PDF is too large. Try a shorter document.");
  }

  const fileName = path.basename(file.originalname).slice(0, 120);
  const doc = await Document.create({
    userId,
    fileName,
    pageCount: pages.length,
    chunkCount: pieces.length,
  });

  try {
    // 3. EMBED: turn every chunk into a vector
    const vectors = await embedTexts(pieces.map((p) => p.text));

    // 4. STORE: text + embedding + metadata together
    await DocumentChunk.insertMany(
      pieces.map((p, i) => ({
        userId,
        documentId: doc._id,
        fileName,
        page: p.page,
        text: p.text,
        embedding: vectors[i],
      }))
    );
  } catch (err) {
    // don't leave a half-processed document behind
    await DocumentChunk.deleteMany({ documentId: doc._id });
    await Document.deleteOne({ _id: doc._id });
    console.error("Ingestion failed:", err.status, err.message);
    throw new ApiError(502, "Could not process the document right now. Please try again.");
  }

  return res.status(201).json(new ApiResponse(201, doc, "Document uploaded and indexed"));
});

// GET /documents
const listDocuments = asyncHandler(async (req, res) => {
  const docs = await Document.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .select("fileName pageCount chunkCount createdAt");
  return res.status(200).json(new ApiResponse(200, docs, "Documents fetched"));
});

// DELETE /documents/:id
const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid document id");

  // filter by userId so nobody can delete someone else's document
  const doc = await Document.findOneAndDelete({ _id: id, userId: req.user._id });
  if (!doc) throw new ApiError(404, "Document not found");

  await DocumentChunk.deleteMany({ documentId: doc._id });
  return res.status(200).json(new ApiResponse(200, {}, "Document deleted"));
});

export { uploadDocument, listDocuments, deleteDocument };