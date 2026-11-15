import mongoose, { Schema } from "mongoose";

// One record per uploaded file. Its text pieces live in DocumentChunk.
const documentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    fileName: { type: String, required: true },
    pageCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Document = mongoose.model("Document", documentSchema);