import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlacedOrder } from "@/lib/types";

export class OrderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Turn a DB exception from place_order() into something we can show a customer. */
export function explainOrderError(raw: string): OrderError {
  if (raw.includes("INSUFFICIENT_STOCK")) {
    const [, name, stock] = raw.match(/INSUFFICIENT_STOCK:([^:]+):(\d+)/) ?? [];
    return new OrderError("INSUFFICIENT_STOCK", name ? `Only ${stock} of "${name}" left in stock.` : "Not enough stock.");
  }
  if (raw.includes("PRODUCT_UNAVAILABLE")) return new OrderError("PRODUCT_UNAVAILABLE", "An item in the cart is no longer available.");
  if (raw.includes("CART_EMPTY")) return new OrderError("CART_EMPTY", "The cart is empty.");
  if (raw.includes("CUSTOMER_DETAILS_MISSING")) return new OrderError("CUSTOMER_DETAILS_MISSING", "Customer name and email are required.");
  if (raw.includes("NOT_AWAITING_CONFIRMATION"))
    return new OrderError("NOT_AWAITING_CONFIRMATION", "The order summary must be reviewed and confirmed first.");
  if (raw.includes("INVALID_QUANTITY")) return new OrderError("INVALID_QUANTITY", "A quantity in the cart is invalid.");
  if (raw.includes("SESSION_NOT_FOUND")) return new OrderError("SESSION_NOT_FOUND", "Chat session not found.");
  return new OrderError("UNKNOWN", "We couldn't place the order. Please try again.");
}

/** Atomically creates order + items + invoice from the session's server-side cart. Idempotent. */
export async function placeOrder(sessionId: string): Promise<PlacedOrder> {
  const { data, error } = await supabaseAdmin().rpc("place_order", { p_session_id: sessionId });
  if (error) throw explainOrderError(error.message);
  const r = data as PlacedOrder;
  return { ...r, total: Number(r.total) };
}
