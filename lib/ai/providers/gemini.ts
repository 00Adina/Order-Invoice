import "server-only";
import { ApiError, FinishReason, GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
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

/**
 * Rank a model id for chat use: newest stable "flash" first, then previews and "lite".
 * Returns null for models that can't serve this app (speech, images, embeddings, live audio…).
 */
export function rankChatModel(name: string, actions: string[] | undefined): number | null {
  const id = name.replace(/^models\//, "");
  if (!id.startsWith("gemini-") || !id.includes("flash")) return null;
  if (actions && !actions.includes("generateContent")) return null;
  if (/(tts|image|live|audio|embed|robotics|nano|omni|vision|computer)/.test(id)) return null;
  const version = Number(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  let score = version * 100;
  if (/(preview|exp)/.test(id)) score -= 20;
  if (id.includes("lite")) score -= 10;
  if (/-\d{3,}$/.test(id)) score -= 1; // dated snapshots after the plain alias
  return score;
}

let resolvedModel: string | null = null;

/** Ask Google which models this API key can use and pick the best chat-capable Flash model. */
async function pickAvailableModel(): Promise<string | null> {
  let best: { id: string; score: number } | null = null;
  const pager = await gemini().models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    if (!m.name) continue;
    const score = rankChatModel(m.name, m.supportedActions);
    if (score !== null && (!best || score > best.score)) best = { id: m.name.replace(/^models\//, ""), score };
  }
  return best?.id ?? null;
}

const BLOCKED = new Set<string>([FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII]);

/**
 * One customer turn on Gemini. Model turns are appended exactly as returned
 * (including any thought signatures) so multi-step tool use keeps working.
 */
export async function runGeminiTurn(history: Content[], userText: string, state: TurnState, system: string): Promise<TurnResult> {
  const env = serverEnv();
  const contents: Content[] = [...history, { role: "user", parts: [{ text: userText }] }];
  let reply = "";

  const generate = (model: string) =>
    gemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      },
    });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const model = resolvedModel ?? env.GEMINI_MODEL;
    let response;
    try {
      response = await generate(model);
    } catch (err) {
      // Model ids change over time. If ours is unknown to this key, find one that exists and retry once.
      if (!(err instanceof ApiError) || err.status !== 404) throw err;
      const fallback = await pickAvailableModel().catch(() => null);
      if (!fallback || fallback === model) throw err;
      console.warn(`[gemini] model "${model}" is not available for this API key; using "${fallback}". Set GEMINI_MODEL to choose explicitly.`);
      resolvedModel = fallback;
      response = await generate(fallback);
    }

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
