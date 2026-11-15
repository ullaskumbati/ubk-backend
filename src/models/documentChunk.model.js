import mongoose, { Schema } from "mongoose";

// One record per chunk: the text (sent to the LLM), its embedding (used only for
// searching) and metadata (used for citations and per-user access control).
const documentChunkSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  documentId: { type: Schema.Types.ObjectId, required: true, index: true },
  fileName: { type: String, required: true },
  page: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true, select: false }, // big, so only load when searching
});

export const DocumentChunk = mongoose.model("DocumentChunk", documentChunkSchema);