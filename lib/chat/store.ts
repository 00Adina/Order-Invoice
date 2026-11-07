import "server-only";
import { priceCart } from "@/lib/cart";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BusinessSettings, CartEntry, CartSummary, ChatStatus, CustomerDetails, DisplayMessage, Product } from "@/lib/types";

export interface ChatSessionRow {
  id: string;
  /** Provider-specific model history (Claude messages or Gemini contents), append-only. */
  transcript: unknown[];
  display: DisplayMessage[];
  cart: CartEntry[];
  customer: CustomerDetails;
  notes: string | null;
  status: ChatStatus;
  order_id: string | null;
  message_count: number;
  version: number;
}

export class ConflictError extends Error {
  constructor() {
    super("The chat was updated in another tab. Please retry.");
  }
}

const COLUMNS = "id, transcript, display, cart, customer, notes, status, order_id, message_count, version";

export async function loadSession(id: string): Promise<ChatSessionRow | null> {
  const { data, error } = await supabaseAdmin().from("chat_sessions").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ChatSessionRow | null) ?? null;
}

export async function createSession(): Promise<ChatSessionRow> {
  const { data, error } = await supabaseAdmin().from("chat_sessions").insert({}).select(COLUMNS).single();
  if (error || !data) throw new Error(error?.message ?? "Could not create chat session");
  return data as ChatSessionRow;
}

/** Optimistic-concurrency update: fails with ConflictError if someone else wrote first. */
export async function saveSession(
  row: ChatSessionRow,
  patch: Partial<Omit<ChatSessionRow, "id" | "version">>,
): Promise<ChatSessionRow> {
  const { data, error } = await supabaseAdmin()
    .from("chat_sessions")
    .update({ ...patch, version: row.version + 1 })
    .eq("id", row.id)
    .eq("version", row.version)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ConflictError();
  return data as ChatSessionRow;
}

export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin().from("products").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function summarizeCart(cart: CartEntry[], settings: BusinessSettings): Promise<CartSummary> {
  const products = await fetchProductsByIds(cart.map((c) => c.product_id));
  const priced = priceCart(cart, products, Number(settings.tax_rate), settings.currency_code);
  return {
    lines: priced.lines,
    item_count: priced.item_count,
    subtotal: priced.subtotal,
    tax_rate: priced.tax_rate,
    tax_amount: priced.tax_amount,
    total: priced.total,
    currency_code: priced.currency_code,
  };
}
