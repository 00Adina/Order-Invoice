import { ArrowLeft, Download, ExternalLink, MessageSquare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoicePaidButton } from "@/components/admin/invoice-paid-button";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { InvoiceStatusBadge, OrderStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import type { Customer, DisplayMessage, Invoice, Order, OrderItem } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Order" };

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireAdmin();

  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();
  const o = order as Order;

  const [{ data: items }, { data: customer }, { data: invoice }, { data: chat }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("product_name"),
    supabase.from("customers").select("*").eq("id", o.customer_id).single(),
    supabase.from("invoices").select("*").eq("order_id", id).maybeSingle(),
    o.chat_session_id ? supabase.from("chat_sessions").select("display").eq("id", o.chat_session_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = customer as Customer;
  const inv = invoice as Invoice | null;
  const m = (v: number | string) => formatMoney(Number(v), o.currency_code);
  const conversation = ((chat as { display: DisplayMessage[] } | null)?.display ?? []) as DisplayMessage[];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin/orders">
          <ArrowLeft />
          Orders
        </Link>
      </Button>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {o.order_number}
            <OrderStatusBadge status={o.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(o.created_at, { dateStyle: "full", timeStyle: "short" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status</span>
          <OrderStatusSelect id={o.id} status={o.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((items ?? []) as OrderItem[]).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="pl-6">
                      <p className="font-medium">{it.product_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{it.sku}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.quantity} <span className="text-xs text-muted-foreground">{it.unit}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m(it.unit_price)}</TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{m(it.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-transparent tabular-nums">
                <TableRow>
                  <TableCell colSpan={3} className="pl-6 text-right text-muted-foreground">Subtotal</TableCell>
                  <TableCell className="pr-6 text-right">{m(o.subtotal)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="pl-6 text-right text-muted-foreground">Tax ({Number(o.tax_rate)}%)</TableCell>
                  <TableCell className="pr-6 text-right">{m(o.tax_amount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="pl-6 text-right font-semibold">Total</TableCell>
                  <TableCell className="pr-6 text-right text-base font-semibold">{m(o.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          {o.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Order notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line">{o.notes}</CardContent>
            </Card>
          )}

          {conversation.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-4" />
                  Chat transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[480px] space-y-3 overflow-y-auto">
                {conversation.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.role === "user" && "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                        msg.role === "user" ? "bg-primary/10" : "bg-muted",
                      )}
                    >
                      <p className="mb-0.5 text-[11px] font-medium text-muted-foreground uppercase">{msg.role === "user" ? c.name : "Assistant"}</p>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{c.name}</p>
              <a href={`mailto:${c.email}`} className="block text-primary hover:underline">
                {c.email}
              </a>
              {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
              {(o.shipping_address ?? c.address) && <p className="whitespace-pre-line text-muted-foreground">{o.shipping_address ?? c.address}</p>}
              <Link href={`/admin/customers?q=${encodeURIComponent(c.email)}`} className="mt-2 inline-block text-xs text-muted-foreground hover:underline">
                View customer history
              </Link>
            </CardContent>
          </Card>

          {inv && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Invoice
                  <InvoiceStatusBadge status={inv.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-y-1">
                  <dt className="text-muted-foreground">Number</dt>
                  <dd className="text-right font-medium">{inv.invoice_number}</dd>
                  <dt className="text-muted-foreground">Issued</dt>
                  <dd className="text-right">{formatDate(inv.issue_date, { dateStyle: "medium", timeZone: "UTC" })}</dd>
                  <dt className="text-muted-foreground">Due</dt>
                  <dd className="text-right">{formatDate(inv.due_date, { dateStyle: "medium", timeZone: "UTC" })}</dd>
                  {inv.paid_at && (
                    <>
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="text-right">{formatDate(inv.paid_at)}</dd>
                    </>
                  )}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <a href={`/api/admin/invoices/${inv.id}/pdf`} download>
                      <Download />
                      PDF
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/invoice/${inv.public_token}`} target="_blank">
                      <ExternalLink />
                      Customer link
                    </Link>
                  </Button>
                  <InvoicePaidButton id={inv.id} status={inv.status} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
