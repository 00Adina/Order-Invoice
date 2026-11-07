import type { NextRequest } from "next/server";
import { getInvoiceByToken } from "@/lib/invoice/data";
import { pdfResponse } from "@/lib/invoice/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const bundle = await getInvoiceByToken(token);
    if (!bundle) return new Response("Invoice not found", { status: 404 });
    const inline = req.nextUrl.searchParams.get("inline") === "1";
    return pdfResponse(bundle, inline ? "inline" : "attachment");
  } catch (err) {
    console.error("[invoice pdf]", err);
    return new Response("Could not generate invoice", { status: 500 });
  }
}
