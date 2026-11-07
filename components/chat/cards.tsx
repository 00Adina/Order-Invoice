"use client";
import { CheckCircle2, Download, ExternalLink, FileText, Loader2, Pencil, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import type { CartSummary, CustomerDetails, PlacedOrder } from "@/lib/types";

export function CartLines({ cart, compact = false }: { cart: CartSummary; compact?: boolean }) {
  if (cart.lines.length === 0) return <p className="text-sm text-muted-foreground">Your cart is empty.</p>;
  const m = (n: number) => formatMoney(n, cart.currency_code);
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-2">
        {cart.lines.map((l) => (
          <li key={l.product_id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">
                {l.quantity} × {m(l.unit_price)}
                {!compact && <span> · {l.unit}</span>}
              </p>
            </div>
            <span className="shrink-0 font-medium tabular-nums">{m(l.line_total)}</span>
          </li>
        ))}
      </ul>
      <Separator />
      <dl className="space-y-1 tabular-nums">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd>{m(cart.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Tax ({cart.tax_rate}%)</dt>
          <dd>{m(cart.tax_amount)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>{m(cart.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 w-full max-w-md rounded-lg border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export function CartCard({ cart }: { cart: CartSummary }) {
  return (
    <Shell icon={<ShoppingCart className="size-4 text-primary" />} title="Cart updated">
      <CartLines cart={cart} compact />
    </Shell>
  );
}

export function ConfirmCard({
  cart,
  customer,
  active,
  busy,
  onConfirm,
  onEdit,
}: {
  cart: CartSummary;
  customer: CustomerDetails;
  active: boolean;
  busy: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <Shell icon={<FileText className="size-4 text-primary" />} title="Please review your order">
      <CartLines cart={cart} />
      <Separator className="my-3" />
      <div className="space-y-0.5 text-sm">
        <p className="font-medium">{customer.name}</p>
        <p className="text-muted-foreground">{customer.email}</p>
        {customer.phone && <p className="text-muted-foreground">{customer.phone}</p>}
        {customer.address && <p className="whitespace-pre-line text-muted-foreground">{customer.address}</p>}
      </div>
      {active ? (
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Confirm order
          </Button>
          <Button variant="outline" onClick={onEdit} disabled={busy}>
            <Pencil />
            Change
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">This summary is no longer current.</p>
      )}
    </Shell>
  );
}

export function InvoiceCard({ order }: { order: PlacedOrder }) {
  return (
    <Shell icon={<CheckCircle2 className="size-4 text-success" />} title="Order placed">
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Order</dt>
        <dd className="text-right font-medium">{order.order_number}</dd>
        <dt className="text-muted-foreground">Invoice</dt>
        <dd className="text-right font-medium">{order.invoice_number}</dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd className="text-right font-semibold tabular-nums">{formatMoney(order.total, order.currency_code)}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild className="flex-1">
          <a href={`/api/invoices/${order.invoice_token}/pdf`} download>
            <Download />
            Download PDF
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/invoice/${order.invoice_token}`} target="_blank">
            <ExternalLink />
            View
          </Link>
        </Button>
      </div>
    </Shell>
  );
}
