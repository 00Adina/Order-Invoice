import "server-only";
import { FinishReason, GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { serverEnv } from "@/lib/env";
import { TOOLS, executeTool, type TurnState } from "@/lib/ai/tools";
import { MAX_TOOL_ROUNDS, REFUSAL_REPLY, RETRY_REPLY, type TurnResult } from "@/lib/ai/types";

let client: GoogleGenAI | null = null;
function gemini() {
  if (!client) {
    const env = serverEnv();
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: { timeout: 60_000, ...(env.GEMINI_BASE_URL ? { baseUrl: env.GEMINI_BASE_URL } : {}) },
    });
  }
  return client;
}

/** The same tools Claude uses, declared for Gemini (JSON Schema is accepted as-is). */
const FUNCTION_DECLARATIONS: FunctionDeclaration[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.input_schema,
}));

const BLOCKED = new Set<string>([FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII]);

/**
 * One customer turn on Gemini. Model turns are appended exactly as returned
 * (including any thought signatures) so multi-step tool use keeps working.
 */
export async function runGeminiTurn(history: Content[], userText: string, state: TurnState, system: string): Promise<TurnResult> {
  const env = serverEnv();
  const contents: Content[] = [...history, { role: "user", parts: [{ text: userText }] }];
  let reply = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await gemini().models.generateContent({
      model: env.GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      },
    });

    const candidate = response.candidates?.[0];
    if (response.promptFeedback?.blockReason || (candidate?.finishReason && BLOCKED.has(candidate.finishReason))) {
      return { transcript: null, reply: REFUSAL_REPLY };
    }
    if (!candidate?.content?.parts?.length) {
      return { transcript: null, reply: RETRY_REPLY };
    }

    contents.push({ role: "model", parts: candidate.content.parts });

    const text = candidate.content.parts
      .flatMap((p) => (p.text && !p.thought ? [p.text] : []))
      .join("")
      .trim();
    if (text) reply = text;

    const calls = candidate.content.parts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));
    if (calls.length === 0) break;

    if (candidate.finishReason === FinishReason.MAX_TOKENS) {
      // Never run a tool call that may have been cut off.
      return { transcript: null, reply: RETRY_REPLY };
    }

    // Run sequentially (tools mutate the cart in order); answer all calls in one user turn.
    const results: Part[] = [];
    for (const call of calls) {
      const result = await executeTool(call.name ?? "", call.args ?? {}, state);
      const payload = JSON.parse(result.content) as Record<string, unknown>;
      results.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: result.isError ? { error: payload.error ?? payload } : { output: payload },
        },
      });
    }
    contents.push({ role: "user", parts: results });

    if (round === MAX_TOOL_ROUNDS - 1) {
      reply = "I've updated your order. Is there anything else you'd like to add or change?";
    }
  }

  return { transcript: contents, reply: reply || "Done. Anything else I can help with?" };
}
