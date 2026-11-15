// unpdf wraps a modern PDF engine, so it reads many files the old pdf-parse@1.1.1 fails on.
// Install with: npm install unpdf
import { extractText, getDocumentProxy } from "unpdf";

// Returns an array of page texts. pages[0] is page 1.
export async function extractPdfPages(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}