import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { InvoiceBundle } from "@/lib/invoice/pdf";
import type { BusinessSettings, Customer, Invoice, Order, OrderItem } from "@/lib/types";

const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isValidInvoiceToken(token: string) {
  return TOKEN_RE.test(token);
}

async function bundleFor(db: SupabaseClient, invoice: Invoice): Promise<InvoiceBundle> {
  const [order, items, customer, settings] = await Promise.all([
    db.from("orders").select("*").eq("id", invoice.order_id).single(),
    db.from("order_items").select("*").eq("order_id", invoice.order_id).order("product_name"),
    db.from("customers").select("*").eq("id", invoice.customer_id).single(),
    db.from("business_settings").select("*").eq("id", 1).single(),
  ]);
  for (const r of [order, items, customer, settings]) if (r.error) throw new Error(r.error.message);
  return {
    invoice,
    order: order.data as Order,
    items: (items.data ?? []) as OrderItem[],
    customer: customer.data as Customer,
    settings: settings.data as BusinessSettings,
  };
}

/** Public lookup by unguessable token (customer download links). */
export async function getInvoiceByToken(token: string): Promise<InvoiceBundle | null> {
  if (!isValidInvoiceToken(token)) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.from("invoices").select("*").eq("public_token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? bundleFor(db, data as Invoice) : null;
}

/** Admin lookup. Pass the admin's own (RLS-scoped) client. */
export async function getInvoiceById(db: SupabaseClient, id: string): Promise<InvoiceBundle | null> {
  const { data, error } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? bundleFor(db, data as Invoice) : null;
}
