import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type Part, type ThinkingConfig } from "@google/genai";
import { serverEnv } from "@/lib/env";
import { TOOLS, executeTool, type TurnState } from "@/lib/ai/tools";
import { MAX_TOOL_ROUNDS, REFUSAL_REPLY, RETRY_REPLY, SLOW_REPLY, type TurnResult } from "@/lib/ai/types";

/** Whole customer turn must finish inside the route's 60 s limit, leaving time to save. */
const turnBudgetMs = () => Number(process.env.CHAT_TURN_BUDGET_MS) || 48_000;
/** A single model call that takes longer than this is treated like "busy": switch models instead of waiting. */
const callTimeoutMs = () => Number(process.env.GEMINI_CALL_TIMEOUT_MS) || 15_000;

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

/** Model that replaces GEMINI_MODEL for good when Google says that id doesn't exist (404). */
let resolvedModel: string | null = null;
/** Models Google reported as overloaded / failing, and until when to avoid them. */
const coolingDown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60_000;
/** Google's transient server errors: overloaded (503), internal (500), deadline expired (504). */
const TRANSIENT = new Set([500, 503, 504]);

const isCooling = (model: string) => (coolingDown.get(model) ?? 0) > Date.now();

/** Test helper: forget model choices between test cases. */
export function resetGeminiStateForTests() {
  resolvedModel = null;
  coolingDown.clear();
  modelListCache = null;
}

let modelListCache: { at: number; models: { id: string; score: number }[] } | null = null;

/** Chat-capable Flash models this API key can use, best first (cached for 10 minutes). */
async function availableModels(): Promise<{ id: string; score: number }[]> {
  if (modelListCache && Date.now() - modelListCache.at < 10 * 60_000) return modelListCache.models;
  const models: { id: string; score: number }[] = [];
  const pager = await gemini().models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    if (!m.name) continue;
    const score = rankChatModel(m.name, m.supportedActions);
    if (score !== null) models.push({ id: m.name.replace(/^models\//, ""), score });
  }
  models.sort((a, b) => b.score - a.score);
  modelListCache = { at: Date.now(), models };
  return models;
}

/** Best available model other than `exclude` and anything cooling down. */
async function pickAvailableModel(exclude: string): Promise<string | null> {
  const models = await availableModels().catch(() => []);
  return models.find((m) => m.id !== exclude && !isCooling(m.id))?.id ?? null;
}

/** The model to use now: the configured one, unless it is cooling down after an overload. */
async function currentModel(configured: string): Promise<string> {
  const primary = resolvedModel ?? configured;
  if (!isCooling(primary)) return primary;
  return (await pickAvailableModel(primary)) ?? primary;
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
    const timeout = Math.min(remaining, callTimeoutMs());
    return gemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        thinkingConfig: thinkingConfigFor(model, env.GEMINI_THINKING),
        abortSignal: AbortSignal.timeout(timeout),
      },
    });
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let model = await currentModel(env.GEMINI_MODEL);
    const started = Date.now();
    let response;
    try {
      try {
        response = await generate(model);
      } catch (err) {
        // A call that hung while the turn still has time left = the model is too slow right now.
        const slow = isTimeout(err) && deadline - Date.now() > 3_000;
        const status = err instanceof ApiError ? err.status : null;
        if (!(slow || status === 404 || (status !== null && TRANSIENT.has(status)))) throw err;
        const fallback = await pickAvailableModel(model);
        if (!fallback) throw err;
        if (status === 404) {
          // Model ids change over time: this one doesn't exist for the key, so stop using it.
          console.warn(`[gemini] model "${model}" is not available for this API key; using "${fallback}". Set GEMINI_MODEL to choose explicitly.`);
          resolvedModel = fallback;
        } else {
          // Busy or failing right now: switch at once and give it a few minutes before trying again.
          const why = slow ? `took longer than ${callTimeoutMs() / 1000} s` : `returned ${status} (busy or failing)`;
          console.warn(`[gemini] model "${model}" ${why}; using "${fallback}" for the next ${COOLDOWN_MS / 60_000} minutes.`);
          coolingDown.set(model, Date.now() + COOLDOWN_MS);
        }
        model = fallback;
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
      `[gemini] ${model} round ${round + 1}: ${Date.now() - started} ms, ` +
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
