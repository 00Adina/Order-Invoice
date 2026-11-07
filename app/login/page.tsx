import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";

  // Already signed in as an admin? Skip the form.
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", data.claims.sub).maybeSingle();
    if (admin) redirect(safeNext);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <LoginForm next={safeNext} notAdmin={error === "not_admin"} />
    </main>
  );
}
