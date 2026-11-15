// Import the inner file: the package's index.js tries to read a test PDF when
// loaded as an ES module and crashes. (Install with: npm install pdf-parse@1.1.1)
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Returns an array of page texts. pages[0] is page 1.
export async function extractPdfPages(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent();
      const text = content.items.map((item) => item.str).join(" ");
      pages.push(text);
      return text;
    },
  });
  return pages;
}