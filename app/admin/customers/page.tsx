import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Pager, pageRange } from "@/components/admin/pager";
import { SearchForm } from "@/components/admin/search-form";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ilikePattern } from "@/lib/search";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Customers" };

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  orders: { id: string; order_number: string; total: string; status: string; currency_code: string; created_at: string }[];
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page: pageParam } = await searchParams;
  const { supabase } = await requireAdmin();
  const { page, from, to } = pageRange(pageParam);

  let query = supabase
    .from("customers")
    .select("id, name, email, phone, created_at, orders(id, order_number, total, status, currency_code, created_at)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q?.trim()) {
    const p = ilikePattern(q.trim());
    query = query.or(`name.ilike.${p},email.ilike.${p},phone.ilike.${p}`);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader title="Customers" description="Created automatically when someone places an order. Matched by email." />
      <div className="mb-4">
        <SearchForm placeholder="Name, email or phone" defaultValue={q} />
      </div>
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total spent</TableHead>
              <TableHead>Last order</TableHead>
              <TableHead>Customer since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
            {rows.map((c) => {
              const valid = c.orders.filter((o) => o.status !== "cancelled");
              const spent = valid.reduce((s, o) => s + Number(o.total), 0);
              const last = [...c.orders].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium">{c.name}</p>
                    <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground hover:underline">
                      {c.email}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.orders.length}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMoney(spent, last?.currency_code ?? "USD")}</TableCell>
                  <TableCell>
                    {last ? (
                      <Link href={`/admin/orders/${last.id}`} className="text-primary hover:underline">
                        {last.order_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Pager page={page} total={count ?? 0} params={{ q }} />
      </Card>
    </>
  );
}
