// Splits text into overlapping pieces (~1000 characters, about 250 tokens).
// Overlap keeps a sentence that falls on a boundary from losing its context.
export function chunkText(text, { size = 1000, overlap = 150 } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    if (end < clean.length) {
      // try to end on a sentence boundary, otherwise on a space (never mid-word)
      const windowText = clean.slice(start, end);
      const sentenceEnd = Math.max(
        windowText.lastIndexOf(". "),
        windowText.lastIndexOf("? "),
        windowText.lastIndexOf("! ")
      );
      if (sentenceEnd > size * 0.5) {
        end = start + sentenceEnd + 1;
      } else {
        const space = windowText.lastIndexOf(" ");
        if (space > size * 0.5) end = start + space;
      }
    }

    const piece = clean.slice(start, end).trim();
    if (piece.length >= 20) chunks.push(piece); // skip tiny fragments

    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1); // step back for overlap, always move forward
  }

  return chunks;
}