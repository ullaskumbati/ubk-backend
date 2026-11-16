import { llm, LLM_MODELS } from "../utils/llmClient.js";
import { TOOL_DEFINITIONS, executeTool } from "./tools.js";

const MAX_STEPS = 4; // safety limit so the agent can never loop (and spend money) forever

// Calls the LLM. On the first call it walks the fallback list; after one works,
// the rest of this request sticks with that model (Gemini ties tool-call
// signatures to the model that produced them).
async function chatCompletion(messages, useTools, state) {
  const base = {
    temperature: 0.2,
    messages,
    ...(useTools ? { tools: TOOL_DEFINITIONS, tool_choice: "auto" } : {}),
  };

  if (state.model) return llm.chat.completions.create({ ...base, model: state.model });

  let lastErr;
  for (const model of LLM_MODELS) {
    try {
      const res = await llm.chat.completions.create({ ...base, model });
      state.model = model;
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${model} failed:`, err.status, err.message);
      if (err.status && ![404, 429, 500, 503].includes(err.status)) throw err;
    }
  }
  throw lastErr;
}

// THE AGENT LOOP:
//   ask the LLM -> if it requests tools, run them and hand back the results -> ask again
//   -> stop when it answers in plain text (or we hit MAX_STEPS).
export async function runAgent({ systemPrompt, history, userId }) {
  const messages = [{ role: "system", content: systemPrompt }, ...history];
  const ctx = { userId, sources: [], sourceCounter: 0 };
  const toolsUsed = [];
  const state = { model: null };

  for (let step = 0; step <= MAX_STEPS; step++) {
    const useTools = step < MAX_STEPS; // on the last turn, force a plain answer
    const response = await chatCompletion(messages, useTools, state);
    const msg = response.choices[0].message;

    // No tool requested: this is the final answer.
    if (!msg.tool_calls?.length) {
      return { text: msg.content ?? "", toolsUsed, sources: ctx.sources };
    }

    console.log(`Agent step ${step + 1}: tools requested ->`, msg.tool_calls.map((t) => t.function.name).join(", "));

    // Keep the whole assistant message exactly as received (Gemini needs its hidden
    // thought signatures sent back with the tool results).
    messages.push(msg);

    // Run the requested tools (YOUR code does the work) and return each result.
    const results = await Promise.all(
      msg.tool_calls.map(async (call) => {
        const name = call.function.name;
        if (!toolsUsed.includes(name)) toolsUsed.push(name);
        const output = await executeTool(name, call.function.arguments, ctx);
        return { role: "tool", tool_call_id: call.id, content: output };
      })
    );
    messages.push(...results);
  }

  return {
    text: "I couldn't finish that request. Please try again.",
    toolsUsed,
    sources: ctx.sources,
  };
}