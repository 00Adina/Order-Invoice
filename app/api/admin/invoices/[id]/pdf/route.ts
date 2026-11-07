import type { NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { getInvoiceById } from "@/lib/invoice/data";
import { pdfResponse } from "@/lib/invoice/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin({ redirectTo: false });
    const { id } = await ctx.params;
    const bundle = await getInvoiceById(supabase, id);
    if (!bundle) return new Response("Invoice not found", { status: 404 });
    return pdfResponse(bundle, req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment");
  } catch (err) {
    if (err instanceof AuthError) return new Response("Unauthorized", { status: err.message === "FORBIDDEN" ? 403 : 401 });
    console.error("[admin invoice pdf]", err);
    return new Response("Could not generate invoice", { status: 500 });
  }
}
