import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type Part, type ThinkingConfig } from "@google/genai";
import { serverEnv } from "@/lib/env";
import { TOOLS, executeTool, type TurnState } from "@/lib/ai/tools";
import { MAX_TOOL_ROUNDS, REFUSAL_REPLY, RETRY_REPLY, SLOW_REPLY, type TurnResult } from "@/lib/ai/types";

/** Whole customer turn must finish inside the route's 60 s limit, leaving time to save. */
const turnBudgetMs = () => Number(process.env.CHAT_TURN_BUDGET_MS) || 48_000;

let client: GoogleGenAI | null = null;
function gemini() {
  if (!client) {
    const env = serverEnv();
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: env.GEMINI_BASE_URL ? { baseUrl: env.GEMINI_BASE_URL } : undefined,
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

/**
 * Keep "thinking" short for a snappy chat. Gemini 3+ takes a thinking level;
 * 2.5 models take a token budget; older models don't support the setting.
 */
export function thinkingConfigFor(model: string, level: "minimal" | "low" | "medium" | "high"): ThinkingConfig | undefined {
  const version = Number(model.replace(/^models\//, "").match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  if (version >= 3) {
    const map = { minimal: ThinkingLevel.MINIMAL, low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };
    return { thinkingLevel: map[level] };
  }
  if (version >= 2.5) {
    const budgets = { minimal: 0, low: 512, medium: 2048, high: 8192 };
    return { thinkingBudget: model.includes("pro") ? Math.max(128, budgets[level]) : budgets[level] };
  }
  return undefined;
}

const isTimeout = (err: unknown) => err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");

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

  const deadline = Date.now() + turnBudgetMs();

  const generate = (model: string) => {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) throw Object.assign(new Error("turn budget exhausted"), { name: "TimeoutError" });
    return gemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        thinkingConfig: thinkingConfigFor(model, env.GEMINI_THINKING),
        abortSignal: AbortSignal.timeout(remaining),
      },
    });
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const model = resolvedModel ?? env.GEMINI_MODEL;
    const started = Date.now();
    let response;
    try {
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
    } catch (err) {
      if (!isTimeout(err)) throw err;
      console.warn(`[gemini] turn ran out of time in round ${round + 1} (${Date.now() - started} ms for the last call)`);
      // Roll the turn back so the customer can simply resend; nothing half-done is saved.
      return { transcript: null, reply: SLOW_REPLY };
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
    console.log(
      `[gemini] ${resolvedModel ?? env.GEMINI_MODEL} round ${round + 1}: ${Date.now() - started} ms, ` +
        `finish=${candidate.finishReason ?? "?"}, tools=[${calls.map((c) => c.name).join(", ")}]`,
    );
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
