import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only auth-relevant pages. The chatbot, invoice links and API routes do their own checks.
  matcher: ["/admin/:path*"],
};
