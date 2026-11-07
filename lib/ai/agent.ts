import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { TOOLS, executeTool, type TurnState } from "@/lib/ai/tools";

const MAX_TOOL_ROUNDS = 10;

let client: Anthropic | null = null;
function anthropic() {
  if (!client) {
    // Reads ANTHROPIC_API_KEY from the environment; never shipped to the browser.
    client = new Anthropic({ maxRetries: 2, timeout: 60_000 });
  }
  return client;
}

export interface TurnResult {
  /** Full transcript to persist (previous history + this turn), or null when nothing should be saved. */
  transcript: Anthropic.Beta.BetaMessageParam[] | null;
  reply: string;
}

/**
 * Runs one customer turn: sends the conversation to Claude, executes tool calls
 * against the database until Claude produces a final reply.
 * History is append-only — earlier turns are replayed byte-for-byte.
 */
export async function runAgentTurn(
  history: Anthropic.Beta.BetaMessageParam[],
  userText: string,
  state: TurnState,
): Promise<TurnResult> {
  const env = serverEnv();
  const system = buildSystemPrompt(state.settings);
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: userText }];
  let reply = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic().beta.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 16000,
      system,
      tools: TOOLS,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: env.ANTHROPIC_EFFORT },
      cache_control: { type: "ephemeral" },
      // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      // Discard this turn entirely so the stored history stays valid.
      return {
        transcript: null,
        reply: "Sorry, I can't help with that. I can help you browse products, place an order or get an invoice.",
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (text) reply = text;

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;

    if (response.stop_reason === "max_tokens") {
      // A tool call cut off mid-input must never run.
      return { transcript: null, reply: "Sorry, something went wrong on my side. Could you repeat that?" };
    }

    // Run sequentially: tools mutate the shared cart state in order.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const result = await executeTool(tool.name, tool.input, state);
      results.push({ type: "tool_result", tool_use_id: tool.id, content: result.content, is_error: result.isError });
    }
    // All results for one assistant message go back in a single user message.
    messages.push({ role: "user", content: results });

    if (round === MAX_TOOL_ROUNDS - 1) {
      reply = "I've updated your order. Is there anything else you'd like to add or change?";
    }
  }

  return { transcript: messages, reply: reply || "Done. Anything else I can help with?" };
}
