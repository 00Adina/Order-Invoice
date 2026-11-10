import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, normalizeCart } from "@/lib/cart";
import { fetchProductsByIds, summarizeCart } from "@/lib/chat/store";
import { OrderError, placeOrder } from "@/lib/orders";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BusinessSettings, CartEntry, ChatCard, ChatStatus, CustomerDetails, PlacedOrder, Product } from "@/lib/types";

/** Mutable per-turn state. Tools change it; the route persists it once the turn completes. */
export interface TurnState {
  sessionId: string;
  status: ChatStatus;
  cart: CartEntry[];
  customer: CustomerDetails;
  notes: string | null;
  orderId: string | null;
  settings: BusinessSettings;
  appUrl: string;
  cards: ChatCard[];
  /** Was the summary already shown (and saved) before this customer message? */
  awaitingAtTurnStart: boolean;
  /** Set by any tool that changes cart/customer data during this turn. */
  dirty: boolean;
}

const emptyObject = { type: "object" as const, properties: {}, required: [], additionalProperties: false };

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_products",
    description:
      "Search the live product & service catalog. Use this to identify what the customer is asking for before adding it to the cart. " +
      "Tolerates typos and synonyms. Returns product ids, current prices, units and stock. Search one item per call (e.g. 'shirt', 'jeans').",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Product name, type, SKU or keyword, e.g. 'white t-shirt'" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_catalog",
    description: "List available products and services, optionally filtered by category. Use when the customer asks what you sell or wants to browse.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { category: { type: "string", description: "Category to filter by, or empty string for everything" } },
      required: ["category"],
      additionalProperties: false,
    },
  },
  {
    name: "update_cart",
    description:
      "Add, change or remove cart lines. mode 'add' increases the quantity, mode 'set' sets the exact quantity (0 removes the line). " +
      "Only use product ids returned by search_products or list_catalog. Returns the recalculated cart with authoritative prices and totals.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string", description: "Product id (or exact SKU) from the catalog" },
              quantity: { type: "integer", description: "Quantity (whole number, 0 allowed with mode 'set')" },
              mode: { type: "string", enum: ["add", "set"] },
            },
            required: ["product_id", "quantity", "mode"],
            additionalProperties: false,
          },
        },
      },
      required: ["changes"],
      additionalProperties: false,
    },
  },
  {
    name: "clear_cart",
    description: "Remove everything from the cart.",
    strict: true,
    input_schema: emptyObject,
  },
  {
    name: "view_cart",
    description: "Get the current cart with authoritative prices, tax and total. Call this whenever you need to state a total.",
    strict: true,
    input_schema: emptyObject,
  },
  {
    name: "save_customer_details",
    description:
      "Save the customer's contact and delivery details. Pass an empty string for any field the customer has not provided (it keeps the existing value). " +
      "Name and email are required before an order can be placed; phone, address and notes are optional unless the customer wants delivery.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string", description: "Delivery / billing address" },
        notes: { type: "string", description: "Order notes, e.g. vehicle make/model/year, delivery or fitting instructions" },
      },
      required: ["name", "email", "phone", "address", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "request_order_confirmation",
    description:
      "Lock in the cart and show the customer a full order summary with a Confirm button. Call once the cart is complete and name + email are saved. " +
      "After calling it, ask the customer to review and confirm. Any later cart or detail change requires calling it again.",
    strict: true,
    input_schema: emptyObject,
  },
  {
    name: "place_order",
    description:
      "Place the order and generate the invoice. ONLY call this after request_order_confirmation succeeded AND the customer has explicitly " +
      "confirmed in their latest message (e.g. 'yes', 'confirm', 'place it'). Never call it on your own initiative.",
    strict: true,
    input_schema: emptyObject,
  },
];

// ---------- input validation (never trust tool input blindly) ----------
const Inputs = {
  search_products: z.object({ query: z.string().trim().min(1).max(100) }),
  list_catalog: z.object({ category: z.string().max(100) }),
  update_cart: z.object({
    changes: z
      .array(
        z.object({
          product_id: z.string().trim().min(1).max(100),
          quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
          mode: z.enum(["add", "set"]),
        }),
      )
      .min(1)
      .max(MAX_CART_LINES),
  }),
  save_customer_details: z.object({
    name: z.string().max(120),
    email: z.string().max(200),
    phone: z.string().max(40),
    address: z.string().max(500),
    notes: z.string().max(1000),
  }),
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicProduct(p: Product) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    kind: p.kind,
    description: p.description,
    price: Number(p.price),
    unit: p.unit,
    availability: p.stock === null ? "available" : p.stock > 0 ? `${p.stock} in stock` : "out of stock",
  };
}

async function resolveProducts(refs: string[]): Promise<Map<string, Product>> {
  const ids = refs.filter((r) => UUID_RE.test(r));
  const skus = refs.filter((r) => !UUID_RE.test(r)).map((s) => s.toUpperCase());
  const db = supabaseAdmin();
  const found: Product[] = [];
  if (ids.length) {
    const { data, error } = await db.from("products").select("*").in("id", ids);
    if (error) throw new Error(error.message);
    found.push(...((data ?? []) as Product[]));
  }
  if (skus.length) {
    const { data, error } = await db.from("products").select("*").in("sku", skus);
    if (error) throw new Error(error.message);
    found.push(...((data ?? []) as Product[]));
  }
  const map = new Map<string, Product>();
  for (const p of found) {
    map.set(p.id, p);
    map.set(p.sku.toUpperCase(), p);
  }
  return map;
}

function invalidateConfirmation(state: TurnState) {
  state.dirty = true;
  if (state.status === "awaiting_confirmation") state.status = "active";
}

function orderLocked(state: TurnState) {
  return state.status === "completed"
    ? {
        error:
          "This order has already been placed and cannot be changed. Tell the customer to click 'New order' to start another order, or contact the store to change this one.",
      }
    : null;
}

async function cartPayload(state: TurnState) {
  const summary = await summarizeCart(state.cart, state.settings);
  return { summary };
}

function missingDetails(c: CustomerDetails) {
  const missing: string[] = [];
  if (!c.name?.trim()) missing.push("name");
  if (!c.email?.trim()) missing.push("email");
  return missing;
}

type ToolResult = { content: string; isError?: boolean };

const ok = (value: unknown): ToolResult => ({ content: JSON.stringify(value) });
const fail = (message: string): ToolResult => ({ content: JSON.stringify({ error: message }), isError: true });

export async function executeTool(name: string, rawInput: unknown, state: TurnState): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_products": {
        const input = Inputs.search_products.safeParse(rawInput);
        if (!input.success) return fail("Invalid input: query is required");
        const { data, error } = await supabaseAdmin().rpc("search_products", { q: input.data.query, lim: 8 });
        if (error) throw new Error(error.message);
        const results = ((data ?? []) as Product[]).map(publicProduct);
        return ok(results.length ? { results } : { results: [], note: "No matching products. Offer to show the catalog." });
      }

      case "list_catalog": {
        const input = Inputs.list_catalog.safeParse(rawInput);
        if (!input.success) return fail("Invalid input");
        let q = supabaseAdmin().from("products").select("*").eq("active", true).order("category").order("name").limit(60);
        if (input.data.category.trim()) q = q.ilike("category", input.data.category.trim());
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok({ products: ((data ?? []) as Product[]).map(publicProduct) });
      }

      case "update_cart": {
        const locked = orderLocked(state);
        if (locked) return ok(locked);
        const input = Inputs.update_cart.safeParse(rawInput);
        if (!input.success) return fail(`Invalid input: ${input.error.issues.map((i) => i.message).join("; ")}`);

        const lookup = await resolveProducts(input.data.changes.map((c) => c.product_id));
        const problems: string[] = [];
        const next = new Map(normalizeCart(state.cart).map((e) => [e.product_id, e.quantity]));

        for (const change of input.data.changes) {
          const p = lookup.get(change.product_id) ?? lookup.get(change.product_id.toUpperCase());
          if (!p || !p.active) {
            problems.push(`Unknown or unavailable product "${change.product_id}". Use search_products to find the right id.`);
            continue;
          }
          const current = next.get(p.id) ?? 0;
          const qty = change.mode === "add" ? current + change.quantity : change.quantity;
          if (qty > MAX_LINE_QUANTITY) {
            problems.push(`Quantity for ${p.name} exceeds the maximum of ${MAX_LINE_QUANTITY}.`);
            continue;
          }
          if (p.stock !== null && qty > p.stock) {
            problems.push(`Only ${p.stock} ${p.unit} of ${p.name} in stock (requested ${qty}). Not changed.`);
            continue;
          }
          if (qty === 0) next.delete(p.id);
          else next.set(p.id, qty);
        }

        if (next.size > MAX_CART_LINES) return fail(`A cart can have at most ${MAX_CART_LINES} different items.`);

        state.cart = [...next.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
        invalidateConfirmation(state);
        const { summary } = await cartPayload(state);
        state.cards.push({ type: "cart", cart: summary });
        return ok({ cart: summary, problems: problems.length ? problems : undefined });
      }

      case "clear_cart": {
        const locked = orderLocked(state);
        if (locked) return ok(locked);
        state.cart = [];
        invalidateConfirmation(state);
        return ok({ cart: (await cartPayload(state)).summary });
      }

      case "view_cart": {
        const { summary } = await cartPayload(state);
        return ok({ cart: summary, status: state.status, customer: state.customer, notes: state.notes });
      }

      case "save_customer_details": {
        const locked = orderLocked(state);
        if (locked) return ok(locked);
        const input = Inputs.save_customer_details.safeParse(rawInput);
        if (!input.success) return fail("Invalid input");
        const { name, email, phone, address, notes } = input.data;
        if (email.trim() && !z.email().safeParse(email.trim()).success) {
          return fail(`"${email}" is not a valid email address. Ask the customer to re-check it.`);
        }
        const next: CustomerDetails = { ...state.customer };
        if (name.trim()) next.name = name.trim();
        if (email.trim()) next.email = email.trim().toLowerCase();
        if (phone.trim()) next.phone = phone.trim();
        if (address.trim()) next.address = address.trim();
        state.customer = next;
        if (notes.trim()) state.notes = notes.trim();
        invalidateConfirmation(state);
        return ok({ customer: state.customer, notes: state.notes, still_required: missingDetails(state.customer) });
      }

      case "request_order_confirmation": {
        const locked = orderLocked(state);
        if (locked) return ok(locked);
        const summary = await summarizeCart(state.cart, state.settings);
        if (summary.lines.length === 0) return fail("The cart is empty. Add items first.");
        const missing = missingDetails(state.customer);
        if (missing.length) return fail(`Missing customer details: ${missing.join(", ")}. Ask the customer for them.`);

        const products = await fetchProductsByIds(summary.lines.map((l) => l.product_id));
        const stockIssues = summary.lines.flatMap((l) => {
          const p = products.find((x) => x.id === l.product_id);
          return p && p.stock !== null && p.stock < l.quantity ? [`Only ${p.stock} of ${p.name} left`] : [];
        });
        if (stockIssues.length) return fail(`Stock changed: ${stockIssues.join("; ")}. Adjust the cart.`);

        state.status = "awaiting_confirmation";
        state.cards.push({ type: "confirm", cart: summary, customer: state.customer });
        return ok({
          status: "awaiting_confirmation",
          summary,
          customer: state.customer,
          notes: state.notes,
          instruction:
            "A summary card with a Confirm button is now shown to the customer. Briefly recap the items and total and ask them to confirm.",
        });
      }

      case "place_order": {
        if (state.status === "completed" && state.orderId) {
          return ok({ note: "Order already placed for this chat." });
        }
        // The customer must have seen the summary in an earlier message and replied to it,
        // with nothing changed since. This also guarantees the DB copy of the cart is the one they saw.
        if (state.status !== "awaiting_confirmation" || !state.awaitingAtTurnStart || state.dirty) {
          return fail(
            "The customer has not confirmed the current summary yet. Call request_order_confirmation, then wait for the customer to confirm in their next message.",
          );
        }
        const placed: PlacedOrder = await placeOrder(state.sessionId);
        state.status = "completed";
        state.orderId = placed.order_id;
        state.cards.push({ type: "invoice", order: placed });
        return ok({
          order_number: placed.order_number,
          invoice_number: placed.invoice_number,
          total: placed.total,
          currency: placed.currency_code,
          invoice_url: `${state.appUrl}/invoice/${placed.invoice_token}`,
          instruction: "Thank the customer and tell them the invoice download button is shown below. Do not repeat the URL.",
        });
      }

      default:
        return fail(`Unknown tool ${name}`);
    }
  } catch (err) {
    if (err instanceof OrderError) return fail(err.message);
    console.error(`[tool:${name}]`, err);
    return fail("Internal error while running this tool. Apologise and ask the customer to try again.");
  }
}
