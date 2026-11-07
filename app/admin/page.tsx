import { AlertTriangle, DollarSign, FileWarning, Receipt, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { RevenueChart, type DailyPoint } from "@/components/admin/revenue-chart";
import { OrderStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import type { OrderStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

interface Dashboard {
  revenue_total: number;
  revenue_period: number;
  orders_total: number;
  orders_period: number;
  avg_order_value: number;
  customers_total: number;
  unpaid_total: number;
  unpaid_count: number;
  low_stock: { id: string; name: string; stock: number }[];
  daily: DailyPoint[];
  top_products: { name: string; quantity: number; revenue: number }[];
}

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const [{ data: stats, error }, { data: recent }, { data: settings }] = await Promise.all([
    supabase.rpc("admin_dashboard", { p_days: 30 }),
    supabase
      .from("orders")
      .select("id, order_number, status, total, currency_code, created_at, customers(name)")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("business_settings").select("currency_code").eq("id", 1).single(),
  ]);
  if (error) throw new Error(error.message);
  const d = stats as Dashboard;
  const cur = settings?.currency_code ?? "USD";
  const m = (v: number) => formatMoney(Number(v), cur);
  const daily = d.daily.map((p) => ({ ...p, revenue: Number(p.revenue), orders: Number(p.orders) }));

  const tiles = [
    { label: "Revenue (30 days)", value: m(d.revenue_period), sub: `${m(d.revenue_total)} all time`, icon: DollarSign },
    { label: "Orders (30 days)", value: String(d.orders_period), sub: `${d.orders_total} all time`, icon: ShoppingCart },
    { label: "Average order", value: m(d.avg_order_value), sub: "excluding cancelled", icon: Receipt },
    { label: "Customers", value: String(d.customers_total), sub: "with at least one order", icon: Users },
    { label: "Unpaid invoices", value: m(d.unpaid_total), sub: `${d.unpaid_count} outstanding`, icon: FileWarning },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Sales and order activity at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label} className="gap-2 py-5">
            <CardHeader className="flex flex-row items-center justify-between px-5">
              <CardDescription>{t.label}</CardDescription>
              <t.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-5">
              <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily revenue</CardTitle>
            <CardDescription>Last 30 days, excluding cancelled orders</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={daily} currency={cur} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By revenue, all time</CardDescription>
          </CardHeader>
          <CardContent>
            {d.top_products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <ol className="space-y-3">
                {d.top_products.map((p, i) => {
                  const pct = (Number(p.revenue) / Number(d.top_products[0].revenue)) * 100;
                  return (
                    <li key={p.name} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                          {p.name}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{m(p.revenue)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/75" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.quantity} sold</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent orders</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No orders yet. Place one through the chat to see it here.
                    </TableCell>
                  </TableRow>
                )}
                {(recent ?? []).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                        {o.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>{(o.customers as unknown as { name: string } | null)?.name}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status as OrderStatus} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(o.created_at, { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(Number(o.total), o.currency_code)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Low stock
            </CardTitle>
            <CardDescription>Active products with 5 or fewer left</CardDescription>
          </CardHeader>
          <CardContent>
            {d.low_stock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products are well stocked.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.low_stock.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span className="truncate">{p.name}</span>
                    <span className={p.stock === 0 ? "font-medium text-destructive" : "font-medium"}>{p.stock === 0 ? "Out of stock" : `${p.stock} left`}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
