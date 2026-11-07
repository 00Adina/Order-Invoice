"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthError, requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function guard<T>(fn: (supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]) => Promise<T>): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin({ redirectTo: false });
    await fn(supabase);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "You are not authorised to do that." };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

function check<T extends { error: { message: string; code?: string } | null }>(res: T): T {
  if (res.error) {
    if (res.error.code === "23505") throw new Error("That SKU is already in use.");
    throw new Error(res.error.message);
  }
  return res;
}

// ---------------- products ----------------
const ProductInput = z.object({
  id: z.uuid().optional(),
  sku: z.string().trim().min(1).max(64).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().transform((s) => s || null),
  category: z.string().trim().max(100).optional().transform((s) => s || null),
  kind: z.enum(["product", "service"]),
  price: z.coerce.number().min(0).max(9_999_999_999).multipleOf(0.01, "Price can have at most 2 decimals"),
  unit: z.string().trim().min(1).max(30),
  stock: z
    .union([z.literal(""), z.coerce.number().int().min(0)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  aliases: z
    .string()
    .max(1000)
    .optional()
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 30),
    ),
  active: z.boolean(),
});

export type ProductFormValues = z.input<typeof ProductInput>;

export async function saveProduct(values: ProductFormValues): Promise<ActionResult> {
  return guard(async (supabase) => {
    const { id, ...p } = ProductInput.parse(values);
    if (id) check(await supabase.from("products").update(p).eq("id", id));
    else check(await supabase.from("products").insert(p));
    revalidatePath("/admin/products");
  });
}

export async function setProductActive(id: string, active: boolean): Promise<ActionResult> {
  return guard(async (supabase) => {
    check(await supabase.from("products").update({ active }).eq("id", z.uuid().parse(id)));
    revalidatePath("/admin/products");
  });
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  // Past orders keep their own copy of name/SKU/price, so deleting is safe for history.
  return guard(async (supabase) => {
    check(await supabase.from("products").delete().eq("id", z.uuid().parse(id)));
    revalidatePath("/admin/products");
  });
}

// ---------------- orders ----------------
export async function updateOrderStatus(id: string, status: string): Promise<ActionResult> {
  return guard(async (supabase) => {
    const s = z.enum(ORDER_STATUSES as [string, ...string[]]).parse(status);
    check(await supabase.from("orders").update({ status: s }).eq("id", z.uuid().parse(id)));
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin");
  });
}

// ---------------- invoices ----------------
export async function setInvoicePaid(id: string, paid: boolean): Promise<ActionResult> {
  return guard(async (supabase) => {
    const invoiceId = z.uuid().parse(id);
    const { data } = check(await supabase.from("invoices").select("status").eq("id", invoiceId).single());
    if (data?.status === "void") throw new Error("A void invoice cannot be changed.");
    check(
      await supabase
        .from("invoices")
        .update({ status: paid ? "paid" : "unpaid", paid_at: paid ? new Date().toISOString() : null })
        .eq("id", invoiceId),
    );
    revalidatePath("/admin/invoices");
    revalidatePath("/admin/orders", "layout");
    revalidatePath("/admin");
  });
}

// ---------------- settings ----------------
const SettingsInput = z.object({
  business_name: z.string().trim().min(1).max(120),
  business_email: z.union([z.literal(""), z.email()]).transform((s) => s || null),
  business_phone: z.string().trim().max(40).transform((s) => s || null),
  business_address: z.string().trim().max(500).transform((s) => s || null),
  tax_id: z.string().trim().max(60).transform((s) => s || null),
  currency_code: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase()),
  tax_rate: z.coerce.number().min(0).max(100).multipleOf(0.01),
  payment_terms_days: z.coerce.number().int().min(0).max(365),
  invoice_notes: z.string().trim().max(1000).transform((s) => s || null),
});
export type SettingsFormValues = z.input<typeof SettingsInput>;

export async function saveSettings(values: SettingsFormValues): Promise<ActionResult> {
  return guard(async (supabase) => {
    const s = SettingsInput.parse(values);
    if (!Intl.supportedValuesOf("currency").includes(s.currency_code)) throw new Error("Unknown currency code");
    check(await supabase.from("business_settings").update(s).eq("id", 1));
    revalidatePath("/", "layout");
  });
}

// ---------------- auth ----------------
export async function signOut() {
  const { supabase } = await requireAdmin();
  await supabase.auth.signOut();
  redirect("/login");
}
