import { Download } from "lucide-react";
import Link from "next/link";
import { InvoicePaidButton } from "@/components/admin/invoice-paid-button";
import { PageHeader } from "@/components/admin/page-header";
import { Pager, pageRange } from "@/components/admin/pager";
import { SearchForm } from "@/components/admin/search-form";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ilikePattern } from "@/lib/search";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Invoices" };

type Row = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total: string;
  currency_code: string;
  issue_date: string;
  due_date: string;
  order_id: string;
  customers: { name: string; email: string } | null;
  orders: { order_number: string } | null;
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { q, status, page: pageParam } = await searchParams;
  const { supabase } = await requireAdmin();
  const { page, from, to } = pageRange(pageParam);

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, status, total, currency_code, issue_date, due_date, order_id, customers(name, email), orders(order_number)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status && (INVOICE_STATUSES as string[]).includes(status)) query = query.eq("status", status);
  if (q?.trim()) query = query.ilike("invoice_number", ilikePattern(q.trim()));
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Invoices" description="Generated automatically when an order is confirmed." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {[undefined, ...INVOICE_STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={s ? `?status=${s}` : "?"}
              className={cn(
                "rounded-full border px-3 py-1 text-sm capitalize transition-colors",
                (status ?? undefined) === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {s ?? "All"}
            </Link>
          ))}
        </div>
        <SearchForm placeholder="Invoice number" defaultValue={q}>
          {status && <input type="hidden" name="status" value={status} />}
        </SearchForm>
      </div>
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-52" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No invoices found.
                </TableCell>
              </TableRow>
            )}
            {rows.map((inv) => {
              const overdue = inv.status === "unpaid" && inv.due_date < today;
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>
                    <p>{inv.customers?.name}</p>
                    <p className="text-xs text-muted-foreground">{inv.customers?.email}</p>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/orders/${inv.order_id}`} className="text-primary hover:underline">
                      {inv.orders?.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.issue_date, { dateStyle: "medium", timeZone: "UTC" })}</TableCell>
                  <TableCell className={overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {formatDate(inv.due_date, { dateStyle: "medium", timeZone: "UTC" })}
                    {overdue && " · overdue"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMoney(Number(inv.total), inv.currency_code)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <InvoicePaidButton id={inv.id} status={inv.status} />
                      <Button asChild variant="ghost" size="icon" aria-label={`Download ${inv.invoice_number}`}>
                        <a href={`/api/admin/invoices/${inv.id}/pdf`} download>
                          <Download />
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Pager page={page} total={count ?? 0} params={{ q, status }} />
      </Card>
    </>
  );
}
