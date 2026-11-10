/**
 * Same chat → order → invoice pipeline, driven by the Gemini provider against a
 * scripted mock of the Gemini generateContent REST endpoint and a real Postgres.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Pool, types } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pgSupabase } from "../support/pg-supabase";

const DB_URL = process.env.TEST_DATABASE_URL_GEMINI;

types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1700, (v) => Number(v));

const pool = DB_URL ? new Pool({ connectionString: DB_URL }) : null;
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => pgSupabase(pool!) }));

type Part = Record<string, unknown>;
type Content = { role: string; parts: Part[] };
type Body = {
  contents: Content[];
  systemInstruction?: unknown;
  generationConfig?: { thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number } };
  tools?: { functionDeclarations?: { name: string; parametersJsonSchema?: unknown }[] }[];
};
type Reply = { status?: number; json: unknown; delayMs?: number };
type Step = (body: Body, url: string) => Reply;

const requests: { url: string; headers: IncomingHttpHeaders; body: Body }[] = [];
const modelListCalls: string[] = [];
/** What GET /models returns: the models this (fake) key may use. */
const MODEL_LIST = {
  models: [
    { name: "models/gemini-9-flash-tts", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-9-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-9-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/gemini-9-flash-preview-0101", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
  ],
};
const script: Step[] = [];
let server: Server;

const modelTurn = (parts: Part[], finishReason = "STOP"): Reply => ({
  json: { candidates: [{ content: { role: "model", parts }, finishReason, index: 0 }], usageMetadata: { promptTokenCount: 10 } },
});
let callSeq = 0;
const call = (name: string, args: unknown, extra: Part = {}): Part => ({ functionCall: { id: `call_${++callSeq}`, name, args }, ...extra });

/** functionResponse payloads the app sent back in the latest user turn. */
function lastResponses(body: Body) {
  const last = body.contents.at(-1)!;
  return last.parts
    .filter((p) => p.functionResponse)
    .map((p) => (p.functionResponse as { name: string; response: { output?: Record<string, unknown>; error?: unknown } }));
}

let service: typeof import("@/lib/chat/service");

describe.skipIf(!DB_URL)("chat → order → invoice on Gemini (integration)", () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.method === "GET" && /\/models(\?|$)/.test(req.url ?? "")) {
          modelListCalls.push(req.url ?? "");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(MODEL_LIST));
          return;
        }
        const body = JSON.parse(raw || "{}") as Body;
        requests.push({ url: req.url ?? "", headers: req.headers, body });
        const step = script.shift();
        let out: Reply;
        try {
          out = step ? step(body, req.url ?? "") : { status: 500, json: { error: { code: 500, message: "script exhausted", status: "INTERNAL" } } };
        } catch (err) {
          out = { status: 400, json: { error: { code: 400, message: `[mock] ${(err as Error).message}`, status: "INVALID_ARGUMENT" } } };
        }
        const send = () => {
          if (res.writableEnded || res.destroyed) return;
          res.writeHead(out.status ?? 200, { "content-type": "application/json" });
          res.end(JSON.stringify(out.json));
        };
        if (out.delayMs) setTimeout(send, out.delayMs);
        else send();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;

    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-0000000000",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key-0000000000",
      AI_PROVIDER: "",
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "test-gemini-key-000",
      GEMINI_BASE_URL: `http://127.0.0.1:${port}`,
      NEXT_PUBLIC_APP_URL: "http://shop.test",
      CHAT_MAX_MESSAGES_PER_SESSION: "20",
    });
    service = await import("@/lib/chat/service");
  });

  afterAll(async () => {
    server?.close();
    await pool?.end();
  });

  let sessionId: string;

  it("picks Gemini automatically when only GEMINI_API_KEY is set, and builds a confirmed cart", async () => {
    let whiteTee = "";
    script.push(
      () => modelTurn([call("search_products", { query: "white t-shirt" }, { thoughtSignature: "sig-abc" })]),
      (body) => {
        const [r] = lastResponses(body);
        expect(r.name).toBe("search_products");
        whiteTee = (r.response.output!.results as { sku: string; id: string }[]).find((p) => p.sku === "TSH-WHT")!.id;
        return modelTurn([
          call("update_cart", { changes: [{ product_id: whiteTee, quantity: 2, mode: "add" }] }),
          call("save_customer_details", { name: "Ada Lovelace", email: "ada@example.com", phone: "", address: "", notes: "" }),
        ]);
      },
      (body) => {
        const [cart, details] = lastResponses(body);
        const summary = (cart.response.output!.cart as { subtotal: number; tax_amount: number; total: number });
        expect(summary).toMatchObject({ subtotal: 30, tax_amount: 2.4, total: 32.4 });
        expect(details.response.output!.still_required).toEqual([]);
        return modelTurn([call("request_order_confirmation", {})]);
      },
      (body) => {
        expect(lastResponses(body)[0].response.error).toBeUndefined();
        return modelTurn([{ text: "Here's your summary: 2 × Classic White T-Shirt, total USD 32.40. Shall I place it?" }]);
      },
    );

    const res = await service.handleCustomerMessage(undefined, "Hi, 2 white t-shirts please. I'm Ada Lovelace, ada@example.com");
    sessionId = res.sessionId;
    expect(res.state.status).toBe("awaiting_confirmation");
    expect(res.state.cart.total).toBe(32.4);
    expect(res.state.messages.at(-1)!.text).toContain("Shall I place it?");
    expect(res.state.messages.at(-1)!.card?.type).toBe("confirm");

    // Request shape
    const first = requests[0];
    expect(first.url).toContain(":generateContent");
    expect(first.url).toContain("gemini-3.8-flash");
    expect(first.headers["x-goog-api-key"]).toBe("test-gemini-key-000");
    expect(first.body.systemInstruction).toBeTruthy();
    expect(first.body.generationConfig?.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    const names = first.body.tools![0].functionDeclarations!.map((d) => d.name);
    expect(names).toEqual([
      "search_products",
      "list_catalog",
      "update_cart",
      "clear_cart",
      "view_cart",
      "save_customer_details",
      "request_order_confirmation",
      "place_order",
    ]);
    // The model's turn (with its thought signature) is sent back unchanged
    const echoed = requests[1].body.contents.find((c) => c.role === "model")!;
    expect(echoed.parts[0].thoughtSignature).toBe("sig-abc");
  });

  it("places the order only after the customer confirms in a later message", async () => {
    script.push(
      () => modelTurn([call("place_order", {})]),
      (body) => {
        const [r] = lastResponses(body);
        expect(r.response.error).toBeUndefined();
        expect(r.response.output!.order_number).toMatch(/^ORD-/);
        return modelTurn([{ text: `Thank you! Your order ${r.response.output!.order_number} is placed.` }]);
      },
    );
    const { state } = await service.handleCustomerMessage(sessionId, "Yes please, confirm");
    expect(state.status).toBe("completed");
    expect(state.messages.at(-1)!.card?.type).toBe("invoice");
    const { rows } = await pool!.query("select total from orders where chat_session_id = $1", [sessionId]);
    expect(rows.map((r) => Number(r.total))).toEqual([32.4]);
  });

  it("history from earlier turns is replayed unchanged", () => {
    const turn2 = requests[4].body.contents;
    const turn1 = requests[3].body.contents;
    expect(turn2.slice(0, turn1.length)).toEqual(turn1);
  });

  it("a safety block discards the turn", async () => {
    script.push(() => modelTurn([], "SAFETY"));
    const { sessionId: s, state } = await service.handleCustomerMessage(undefined, "something off-policy");
    expect(state.messages.at(-1)!.text).toMatch(/can't help/);
    const { rows } = await pool!.query("select transcript from chat_sessions where id = $1", [s]);
    expect(rows[0].transcript).toEqual([]);
  });

  it("the Confirm button writes Gemini-format history", async () => {
    script.push(
      () =>
        modelTurn([
          call("update_cart", { changes: [{ product_id: "CAP-BLK", quantity: 1, mode: "add" }] }),
          call("save_customer_details", { name: "Grace", email: "grace@example.com", phone: "", address: "", notes: "" }),
        ]),
      () => modelTurn([call("request_order_confirmation", {})]),
      () => modelTurn([{ text: "Please confirm." }]),
    );
    const { sessionId: s } = await service.handleCustomerMessage(undefined, "one black cap, Grace, grace@example.com");
    const state = await service.confirmFromButton(s);
    expect(state.status).toBe("completed");
    const { rows } = await pool!.query("select transcript from chat_sessions where id = $1", [s]);
    const last = rows[0].transcript.at(-1);
    expect(last.role).toBe("model");
    expect(last.parts[0].text).toContain("is confirmed");
  });

  it("rate limits from Google become a friendly 429", async () => {
    script.push(() => ({ status: 429, json: { error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } } }));
    const { errorResponse } = await import("@/lib/chat/http");
    const err = await service.handleCustomerMessage(undefined, "hello").catch((e) => e);
    const res = errorResponse(err);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/busy/);
  });

  it("falls back to an available Flash model when the configured one returns 404", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    script.push(
      (_b, url) => {
        expect(url).toContain("gemini-3.8-flash:generateContent");
        return { status: 404, json: { error: { code: 404, message: "models/gemini-3.8-flash is not found for API version v1beta", status: "NOT_FOUND" } } };
      },
      (_b, url) => {
        expect(url).toContain("models/gemini-9-flash:generateContent");
        return modelTurn([{ text: "We sell shirts, jeans and more." }]);
      },
      // The chosen model is remembered for later turns
      (_b, url) => {
        expect(url).toContain("models/gemini-9-flash:generateContent");
        return modelTurn([{ text: "Anything else?" }]);
      },
    );
    const { sessionId: s, state } = await service.handleCustomerMessage(undefined, "What do you sell?");
    expect(state.messages.at(-1)!.text).toContain("We sell");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('using "gemini-9-flash"'));
    expect(modelListCalls).toHaveLength(1);
    const next = await service.handleCustomerMessage(s, "ok");
    expect(next.state.messages.at(-1)!.text).toBe("Anything else?");
    warn.mockRestore();
  });

  it("switches to another model at once when Google says the model is busy (503), and stays on it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    script.push(
      (_b, url) => {
        expect(url).toContain("models/gemini-9-flash:generateContent");
        return { status: 503, json: { error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } } };
      },
      (_b, url) => {
        expect(url).toContain("models/gemini-9-flash-lite:generateContent");
        return modelTurn([{ text: "Here are our engine oils." }]);
      },
      (_b, url) => {
        expect(url).toContain("models/gemini-9-flash-lite:generateContent");
        return modelTurn([{ text: "Still here." }]);
      },
    );
    const { sessionId: s, state } = await service.handleCustomerMessage(undefined, "Which engine oils do you have?");
    expect(state.messages.at(-1)!.text).toBe("Here are our engine oils.");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("returned 503"));
    const next = await service.handleCustomerMessage(s, "ok");
    expect(next.state.messages.at(-1)!.text).toBe("Still here.");
    expect(modelListCalls).toHaveLength(1); // model list is cached
    warn.mockRestore();
  });

  it("if the backup is busy too, the customer gets a friendly 'busy' message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const busy = () => ({ status: 503, json: { error: { code: 503, message: "high demand", status: "UNAVAILABLE" } } });
    script.push(busy, busy);
    const { errorResponse } = await import("@/lib/chat/http");
    const err = await service.handleCustomerMessage(undefined, "hello").catch((e) => e);
    const res = errorResponse(err);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/busy/);
    warn.mockRestore();
  });

  it("a reply that takes too long ends with a friendly retry message and nothing is saved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.CHAT_TURN_BUDGET_MS = "4000";
    try {
      script.push(
        () => modelTurn([call("search_products", { query: "engine oil" })]),
        () => ({ ...modelTurn([{ text: "too late" }]), delayMs: 6000 }),
      );
      const started = Date.now();
      const { sessionId: s, state } = await service.handleCustomerMessage(undefined, "engine oil please");
      expect(Date.now() - started).toBeLessThan(5500);
      expect(state.messages.at(-1)!.text).toMatch(/took me too long/);
      const { rows } = await pool!.query("select transcript from chat_sessions where id = $1", [s]);
      expect(rows[0].transcript).toEqual([]);
    } finally {
      delete process.env.CHAT_TURN_BUDGET_MS;
      warn.mockRestore();
    }
  });

  it("a model that hangs is abandoned after the per-call limit and another model answers", async () => {
    const { resetGeminiStateForTests } = await import("@/lib/ai/providers/gemini");
    resetGeminiStateForTests();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GEMINI_CALL_TIMEOUT_MS = "1500";
    try {
      script.push(
        (_b, url) => {
          expect(url).toContain("models/gemini-3.8-flash:generateContent");
          return { ...modelTurn([{ text: "too late" }]), delayMs: 5000 };
        },
        (_b, url) => {
          expect(url).toContain("models/gemini-9-flash:generateContent");
          return modelTurn([{ text: "We have 5W-30 in 1 L and 4 L cans." }]);
        },
      );
      const started = Date.now();
      const { state } = await service.handleCustomerMessage(undefined, "5w-30 oil");
      expect(state.messages.at(-1)!.text).toBe("We have 5W-30 in 1 L and 4 L cans.");
      expect(Date.now() - started).toBeLessThan(4000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("took longer than 1.5 s"));
    } finally {
      delete process.env.GEMINI_CALL_TIMEOUT_MS;
      warn.mockRestore();
    }
  });
});
