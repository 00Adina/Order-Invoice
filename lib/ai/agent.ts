import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Content } from "@google/genai";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { runClaudeTurn } from "@/lib/ai/providers/anthropic";
import { runGeminiTurn } from "@/lib/ai/providers/gemini";
import type { TurnState } from "@/lib/ai/tools";
import type { TurnResult } from "@/lib/ai/types";
import { aiProvider, type AiProvider } from "@/lib/env";

export type { TurnResult } from "@/lib/ai/types";

/** Each provider stores history in its own format; detect which one a saved transcript uses. */
function transcriptProvider(history: unknown[]): AiProvider | null {
  for (const m of history) {
    const role = (m as { role?: string })?.role;
    if (role === "assistant") return "anthropic";
    if (role === "model") return "gemini";
  }
  return null;
}

/** History for the active provider. If the provider was switched mid-chat, the model starts fresh (the UI keeps the visible chat). */
function compatibleHistory(history: unknown[], provider: AiProvider): unknown[] {
  const owner = transcriptProvider(history);
  return owner && owner !== provider ? [] : history;
}

/**
 * Runs one customer turn with the configured AI provider: the model reads the
 * conversation, calls the order tools against the database, and replies.
 */
export async function runAgentTurn(history: unknown[], userText: string, state: TurnState): Promise<TurnResult> {
  const provider = aiProvider();
  const system = buildSystemPrompt(state.settings);
  const past = compatibleHistory(history, provider);
  return provider === "gemini"
    ? runGeminiTurn(past as Content[], userText, state, system)
    : runClaudeTurn(past as Anthropic.Beta.BetaMessageParam[], userText, state, system);
}

/** Append a confirm-button exchange to the history in the active provider's format. */
export function appendExchange(history: unknown[], userText: string, assistantText: string): unknown[] {
  const provider = aiProvider();
  const past = compatibleHistory(history, provider);
  if (provider === "gemini") {
    return [...past, { role: "user", parts: [{ text: userText }] }, { role: "model", parts: [{ text: assistantText }] }];
  }
  return [...past, { role: "user", content: userText }, { role: "assistant", content: [{ type: "text", text: assistantText }] }];
}
