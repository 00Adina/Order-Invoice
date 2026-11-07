/**
 * End-to-end test of the chat → order → invoice pipeline against a real Postgres
 * (schema + RPCs from supabase/migrations) and a scripted mock of the Claude
 * Messages API. Run with:  npm run test:integration
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Pool, types } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pgSupabase } from "../support/pg-supabase";

const DB_URL = process.env.TEST_DATABASE_URL;

// Match PostgREST's JSON shapes: dates/timestamps as strings, numerics as numbers.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1700, (v) => Number(v));

const pool = DB_URL ? new Pool({ connectionString: DB_URL }) : null;
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => pgSupabase(pool!) }));

// ---------------- mock Claude API ----------------
type Body = {
  model: string;
  messages: { role: string; content: unknown }[];
  tools: { name: string; strict?: boolean }[];
  thinking?: unknown;
  fallbacks?: unknown;
  output_config?: unknown;
};
type Block = Record<string, unknown>;
type Step = (body: Body) => { content: Block[]; stop_reason: string };

const requests: { headers: IncomingHttpHeaders; body: Body }[] = [];
const script: Step[] = [];
let server: Server;

const text = (t: string): Block => ({ type: "text", text: t });
let toolSeq = 0;
const toolUse = (name: string, input: unknown): Block => ({ type: "tool_use", id: `toolu_${++toolSeq}`, name, input });

/** Tool results the server sent back in the latest user message. */
function lastToolResults(body: Body) {
  const last = body.messages.at(-1)!;
  const blocks = Array.isArray(last.content) ? (last.content as Block[]) : [];
  return blocks
    .filter((b) => b.type === "tool_result")
    .map((b) => ({ isError: Boolean(b.is_error), json: JSON.parse(String(b.content)) }));
}

// ---------------- helpers ----------------
let service: typeof import("@/lib/chat/service");

async function stock(sku: string) {
  return (await pool!.query("select stock from products where sku = $1", [sku])).rows[0].stock as number;
}

describe.skipIf(!DB_URL)("chat → order → invoice (integration)", () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw) as Body;
        requests.push({ headers: req.headers, body });
        const step = script.shift();
        if (!step) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "script exhausted" } }));
          return;
        }
        let out: ReturnType<Step>;
        try {
          out = step(body);
        } catch (err) {
          // Surface assertion failures inside the mock as a non-retryable API error
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: `[mock] ${(err as Error).message}` } }));
          return;
        }
        const { content, stop_reason } = out;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: `msg_${requests.length}`,
            type: "message",
            role: "assistant",
            model: body.model,
            content,
            stop_reason,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;

    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-0000000000",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key-0000000000",
      ANTHROPIC_API_KEY: "sk-ant-test",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      NEXT_PUBLIC_APP_URL: "http://shop.test",
      CHAT_MAX_MESSAGES_PER_SESSION: "5",
    });
    service = await import("@/lib/chat/service");
  });

  afterAll(async () => {
    server?.close();
    await pool?.end();
  });

  let sessionId: string;
  let whiteTee: string;
  let jeans: string;

  it("turn 1: identifies items and asks a clarifying question", async () => {
    script.push(
      () => ({
        content: [toolUse("search_products", { query: "shirt" }), toolUse("search_products", { query: "jeans" })],
        stop_reason: "tool_use",
      }),
      (body) => {
        const [shirts, jeansRes] = lastToolResults(body);
        whiteTee = shirts.json.results.find((p: { sku: string }) => p.sku === "TSH-WHT").id;
        jeans = jeansRes.json.results[0].id;
        expect(jeansRes.json.results[0].price).toBe(49.99);
        return { content: [text("Which shirt would you like? White tee or black tee (USD 15.00 each)?")], stop_reason: "end_turn" };
      },
    );

    const { sessionId: id, state } = await service.handleCustomerMessage(undefined, "Hello, I want to order 2 shirts and 1 pair of jeans");
    sessionId = id;
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].text).toContain("Which shirt");
    expect(state.cart.lines).toHaveLength(0);
    expect(whiteTee).toBeTruthy();

    // Request shape sent to Claude
    const first = requests[0];
    expect(first.body.model).toBe("claude-opus-5-5");
    expect(first.body.fallbacks).toBe("default");
    expect(String(first.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(first.body.thinking).toEqual({ type: "adaptive" });
    expect(first.body.tools.every((t) => t.strict)).toBe(true);
    // Both parallel tool results went back in a single user message
    expect(lastToolResults(requests[1].body)).toHaveLength(2);
  });

  it("turn 2: builds the cart, saves details, refuses to place the order without confirmation", async () => {
    script.push(
      () => ({
        content: [
          toolUse("update_cart", {
            changes: [
              { product_id: whiteTee, quantity: 2, mode: "add" },
              { product_id: "JNS-SLM", quantity: 1, mode: "add" }, // SKU also accepted
            ],
          }),
          toolUse("save_customer_details", { name: "Ada Lovelace", email: "ADA@example.com", phone: "", address: "1 Analytical Way", notes: "Size L" }),
        ],
        stop_reason: "tool_use",
      }),
      (body) => {
        // 2 × 15.00 + 49.99 = 79.99, tax 8% = 6.40, total 86.39
        const [cart, details] = lastToolResults(body);
        expect(cart.json.cart.subtotal).toBe(79.99);
        expect(cart.json.cart.tax_amount).toBe(6.4);
        expect(cart.json.cart.total).toBe(86.39);
        expect(details.json.customer.email).toBe("ada@example.com");
        expect(details.json.still_required).toEqual([]);
        return { content: [toolUse("request_order_confirmation", {})], stop_reason: "tool_use" };
      },
      (body) => {
        expect(lastToolResults(body)[0].isError).toBe(false);
        // A model that jumps the gun must be stopped server-side
        return { content: [toolUse("place_order", {})], stop_reason: "tool_use" };
      },
      (body) => {
        const [r] = lastToolResults(body);
        expect(r.isError).toBe(true);
        expect(r.json.error).toMatch(/not confirmed/);
        return { content: [text("Here is your summary. Shall I place the order?")], stop_reason: "end_turn" };
      },
    );
    const { state } = await service.handleCustomerMessage(sessionId, "White ones please. I'm Ada Lovelace, ADA@example.com, 1 Analytical Way");
    expect(state.status).toBe("awaiting_confirmation");
    expect(state.cart.total).toBe(86.39);
    expect(state.messages.at(-1)!.card?.type).toBe("confirm");
    expect((await pool!.query("select count(*)::int as n from orders")).rows[0].n).toBe(0);
  });

  it("history is replayed append-only between turns", () => {
    const turn2First = requests[2].body.messages;
    const turn1Last = requests[1].body.messages;
    // Everything sent in turn 1, plus Claude's final reply, is an exact prefix of turn 2
    expect(turn2First.slice(0, turn1Last.length)).toEqual(turn1Last);
  });

  it("turn 3: customer confirms → order + invoice created atomically", async () => {
    const teeBefore = await stock("TSH-WHT");
    script.push(
      () => ({ content: [toolUse("place_order", {})], stop_reason: "tool_use" }),
      (body) => {
        const [r] = lastToolResults(body);
        expect(r.isError).toBe(false);
        expect(r.json.invoice_url).toMatch(/^http:\/\/shop\.test\/invoice\/[0-9a-f]{64}$/);
        return { content: [text(`Done! Order ${r.json.order_number} is placed.`)], stop_reason: "end_turn" };
      },
    );
    const { state } = await service.handleCustomerMessage(sessionId, "Yes, confirm");
    expect(state.status).toBe("completed");
    const card = state.messages.at(-1)!.card;
    expect(card?.type).toBe("invoice");

    const { rows } = await pool!.query("select o.total, o.notes, i.invoice_number, i.public_token from orders o join invoices i on i.order_id = o.id");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].total)).toBe(86.39);
    expect(rows[0].notes).toBe("Size L");
    expect(await stock("TSH-WHT")).toBe(teeBefore - 2);

    // The invoice link works and renders a PDF
    const { getInvoiceByToken } = await import("@/lib/invoice/data");
    const { renderInvoicePdf } = await import("@/lib/invoice/pdf");
    const bundle = await getInvoiceByToken(rows[0].public_token);
    expect(bundle?.items).toHaveLength(2);
    expect(bundle?.customer.name).toBe("Ada Lovelace");
    const pdf = await renderInvoicePdf(bundle!);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(await getInvoiceByToken("0".repeat(64))).toBeNull();
    expect(await getInvoiceByToken("not-a-token")).toBeNull();
  });

  it("turn 4: a placed order can no longer be modified", async () => {
    script.push(
      () => ({ content: [toolUse("update_cart", { changes: [{ product_id: jeans, quantity: 5, mode: "set" }] })], stop_reason: "tool_use" }),
      (body) => {
        expect(lastToolResults(body)[0].json.error).toMatch(/already been placed/);
        return { content: [text("That order is already placed. Click New order to start another.")], stop_reason: "end_turn" };
      },
    );
    const { state } = await service.handleCustomerMessage(sessionId, "Actually make it 5 jeans");
    expect(state.cart.lines.find((l) => l.product_id === jeans)?.quantity).toBe(1);
    expect((await pool!.query("select count(*)::int as n from orders")).rows[0].n).toBe(1);
  });

  it("enforces the per-session message limit", async () => {
    script.push(() => ({ content: [text("ok")], stop_reason: "end_turn" }));
    await service.handleCustomerMessage(sessionId, "thanks"); // 5th message
    await expect(service.handleCustomerMessage(sessionId, "one more")).rejects.toThrow(/message limit/);
  });

  it("Confirm button path places the order without another AI call, and is idempotent", async () => {
    script.push(
      () => ({
        content: [
          toolUse("update_cart", { changes: [{ product_id: "SVC-EXP", quantity: 1, mode: "add" }, { product_id: "CAP-BLK", quantity: 3, mode: "add" }] }),
          toolUse("save_customer_details", { name: "Grace Hopper", email: "grace@example.com", phone: "555-0199", address: "", notes: "" }),
        ],
        stop_reason: "tool_use",
      }),
      () => ({ content: [toolUse("request_order_confirmation", {})], stop_reason: "tool_use" }),
      () => ({ content: [text("Please review and confirm.")], stop_reason: "end_turn" }),
    );
    const { sessionId: s2 } = await service.handleCustomerMessage(undefined, "3 black caps with express delivery. Grace Hopper, grace@example.com");
    const callsBefore = requests.length;
    const state = await service.confirmFromButton(s2);
    expect(requests.length).toBe(callsBefore); // no model call
    expect(state.status).toBe("completed");
    expect(state.messages.at(-1)!.card?.type).toBe("invoice");
    // 14 + 36 = 50 + 8% = 54.00
    const { rows } = await pool!.query("select total from orders where chat_session_id = $1", [s2]);
    expect(Number(rows[0].total)).toBe(54);

    const again = await service.confirmFromButton(s2);
    expect(again.status).toBe("completed");
    expect((await pool!.query("select count(*)::int as n from orders where chat_session_id = $1", [s2])).rows[0].n).toBe(1);
  });

  it("rejects unknown products and over-stock quantities without changing the cart", async () => {
    script.push(
      () => ({
        content: [
          toolUse("update_cart", {
            changes: [
              { product_id: "00000000-0000-0000-0000-000000000000", quantity: 1, mode: "add" },
              { product_id: "SNK-WHT", quantity: 999, mode: "add" },
            ],
          }),
        ],
        stop_reason: "tool_use",
      }),
      (body) => {
        const [r] = lastToolResults(body);
        expect(r.json.problems).toHaveLength(2);
        expect(r.json.problems[1]).toMatch(/Only 25/);
        expect(r.json.cart.lines).toHaveLength(0);
        return { content: [text("Sorry, we only have 25 pairs.")], stop_reason: "end_turn" };
      },
    );
    const { state } = await service.handleCustomerMessage(undefined, "999 sneakers");
    expect(state.cart.lines).toHaveLength(0);
  });

  it("a refusal discards the turn without corrupting history", async () => {
    script.push(() => ({ content: [], stop_reason: "refusal" }));
    const { sessionId: s3, state } = await service.handleCustomerMessage(undefined, "something off-policy");
    expect(state.messages.at(-1)!.text).toMatch(/can't help/);
    const { rows } = await pool!.query("select transcript from chat_sessions where id = $1", [s3]);
    expect(rows[0].transcript).toEqual([]);
  });
});
