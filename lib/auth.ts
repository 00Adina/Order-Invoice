import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Verifies the caller is a signed-in admin. Use at the top of every admin
 * page, server action and admin API route (defence in depth on top of RLS).
 */
export async function requireAdmin(opts: { redirectTo?: boolean } = { redirectTo: true }) {
  const supabase = await supabaseServer();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const email = (claimsData?.claims?.email as string | undefined) ?? null;

  if (!userId) {
    if (opts.redirectTo) redirect("/login");
    throw new AuthError("UNAUTHENTICATED");
  }

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!admin) {
    if (opts.redirectTo) redirect("/login?error=not_admin");
    throw new AuthError("FORBIDDEN");
  }

  return { supabase, userId, email };
}

export class AuthError extends Error {}
