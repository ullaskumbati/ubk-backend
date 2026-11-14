import { llm, LLM_MODEL } from "../utils/llmClient.js";

const SYSTEM_PROMPT =
  "You are a helpful recipe assistant for this app. Be concise. " +
  "If you don't know something, say so instead of guessing.";

// LLMs are stateless, so we keep history and resend it every request.
// In-memory for now; later we'll store it in MongoDB.
const sessions = new Map();
const MAX_MESSAGES = 20; // sliding window to control tokens and cost

export const chatWithLLM = async (req, res) => {
    console.log("CHAT request received", req.body?.message);
  const { sessionId, message } = req.body;

  if (!sessionId || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "sessionId and message are required" });
  }

  const history = sessions.get(sessionId) ?? [];
  history.push({ role: "user", content: message });

  try {
    const stream = await llm.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.3,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.slice(-MAX_MESSAGES),
      ],
    });
        console.log("LLM stream started");  
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    let full = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        full += delta;
        res.write(delta); // stream pieces to the frontend
      }
    }

    history.push({ role: "assistant", content: full });
    sessions.set(sessionId, history);
    res.end();
  } catch (err) {
    console.error("LLM error:", err.status, err.message);
    history.pop(); // drop the user message that got no answer
    if (!res.headersSent) {
      res.status(502).json({ error: "The AI service failed. Please try again." });
    } else {
      res.end();
    }
  }
};