import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Pager, pageRange } from "@/components/admin/pager";
import { SearchForm } from "@/components/admin/search-form";
import { InvoiceStatusBadge, OrderStatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ilikePattern } from "@/lib/search";
import { ORDER_STATUSES, type InvoiceStatus, type OrderStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Orders" };

type Row = {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: string;
  currency_code: string;
  created_at: string;
  customers: { name: string; email: string } | null;
  invoices: { id: string; invoice_number: string; status: InvoiceStatus } | null;
  order_items: { quantity: number }[];
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { q, status, page: pageParam } = await searchParams;
  const { supabase } = await requireAdmin();
  const { page, from, to } = pageRange(pageParam);

  let query = supabase
    .from("orders")
    .select("id, order_number, status, total, currency_code, created_at, customers!inner(name, email), invoices(id, invoice_number, status), order_items(quantity)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status && (ORDER_STATUSES as string[]).includes(status)) query = query.eq("status", status);
  if (q?.trim()) {
    const p = ilikePattern(q.trim());
    // Search by order number, or by customer name/email
    const { data: matches } = await supabase.from("customers").select("id").or(`name.ilike.${p},email.ilike.${p}`).limit(200);
    const ids = (matches ?? []).map((c) => c.id);
    query = ids.length ? query.or(`order_number.ilike.${p},customer_id.in.(${ids.join(",")})`) : query.ilike("order_number", p);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const tabs = [undefined, ...ORDER_STATUSES];
  return (
    <>
      <PageHeader title="Orders" description="Every order placed through the chatbot." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {tabs.map((s) => (
            <Link
              key={s ?? "all"}
              href={s ? `?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}` : q ? `?q=${encodeURIComponent(q)}` : "?"}
              className={cn(
                "rounded-full border px-3 py-1 text-sm capitalize transition-colors",
                (status ?? undefined) === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {s ?? "All"}
            </Link>
          ))}
        </div>
        <SearchForm placeholder="Order #, customer name or email" defaultValue={q}>
          {status && <input type="hidden" name="status" value={status} />}
        </SearchForm>
      </div>
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-primary hover:underline">
                    {o.order_number}
                  </Link>
                </TableCell>
                <TableCell>
                  <p>{o.customers?.name}</p>
                  <p className="text-xs text-muted-foreground">{o.customers?.email}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.created_at, { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                <TableCell className="text-right tabular-nums">{o.order_items.reduce((n, i) => n + i.quantity, 0)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMoney(Number(o.total), o.currency_code)}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell>
                  {o.invoices && (
                    <span className="flex items-center gap-2">
                      <span className="text-xs">{o.invoices.invoice_number}</span>
                      <InvoiceStatusBadge status={o.invoices.status} />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager page={page} total={count ?? 0} params={{ q, status }} />
      </Card>
    </>
  );
}
