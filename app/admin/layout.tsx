import { ExternalLink, LogOut, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/nav";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card px-3 py-4 md:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </div>
          <span className="font-semibold">Order Admin</span>
        </Link>
        <AdminNav />
        <div className="mt-auto space-y-2 border-t pt-4">
          <Link href="/" target="_blank" className="flex items-center gap-2 px-3 text-sm text-muted-foreground hover:text-foreground">
            <ExternalLink className="size-4" />
            Open order chat
          </Link>
          <p className="truncate px-3 text-xs text-muted-foreground" title={email ?? undefined}>
            {email}
          </p>
          <form action={signOut}>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              <LogOut />
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 border-b bg-card/90 px-3 py-2 backdrop-blur md:hidden">
          <AdminNav orientation="horizontal" />
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
