import type { InvoiceBundle } from "@/lib/invoice/pdf";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** HTML rendering of an invoice, mirrors the PDF layout. */
export function InvoiceView({ bundle }: { bundle: InvoiceBundle }) {
  const { invoice, order, items, customer, settings } = bundle;
  const m = (v: number | string) => formatMoney(v, invoice.currency_code);
  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="h-1.5 bg-primary" />
      <div className="space-y-8 p-6 sm:p-10">
        <header className="flex flex-col justify-between gap-6 sm:flex-row">
          <div>
            <h2 className="text-xl font-bold">{settings.business_name}</h2>
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {settings.business_address && <p className="whitespace-pre-line">{settings.business_address}</p>}
              {settings.business_email && <p>{settings.business_email}</p>}
              {settings.business_phone && <p>{settings.business_phone}</p>}
              {settings.tax_id && <p>Tax ID: {settings.tax_id}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-3xl font-bold tracking-tight text-primary">INVOICE</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5 text-sm sm:justify-end">
              <dt className="text-muted-foreground">Invoice #</dt>
              <dd className="font-medium">{invoice.invoice_number}</dd>
              <dt className="text-muted-foreground">Order #</dt>
              <dd className="font-medium">{order.order_number}</dd>
              <dt className="text-muted-foreground">Issued</dt>
              <dd className="font-medium">{formatDate(invoice.issue_date, { dateStyle: "medium", timeZone: "UTC" })}</dd>
              <dt className="text-muted-foreground">Due</dt>
              <dd className="font-medium">{formatDate(invoice.due_date, { dateStyle: "medium", timeZone: "UTC" })}</dd>
            </dl>
            <div className="mt-2 sm:flex sm:justify-end">
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>
        </header>

        <section>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bill to</p>
          <p className="mt-1 font-semibold">{customer.name}</p>
          <div className="text-sm text-muted-foreground">
            <p>{customer.email}</p>
            {customer.phone && <p>{customer.phone}</p>}
            {(order.shipping_address ?? customer.address) && <p className="whitespace-pre-line">{order.shipping_address ?? customer.address}</p>}
          </div>
        </section>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{it.product_name}</p>
                  <p className="text-xs text-muted-foreground">SKU {it.sku} · per {it.unit}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{m(it.unit_price)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{m(it.line_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{m(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax ({Number(invoice.tax_rate)}%)</dt>
              <dd>{m(invoice.tax_amount)}</dd>
            </div>
            <div className="flex justify-between rounded-md bg-primary px-3 py-2 text-base font-semibold text-primary-foreground">
              <dt>Total due</dt>
              <dd>{m(invoice.total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="space-y-1 text-sm text-muted-foreground">
          {order.notes && <p>Order notes: {order.notes}</p>}
          <p>
            Payment due by {formatDate(invoice.due_date, { dateStyle: "long", timeZone: "UTC" })}. Please quote {invoice.invoice_number} with your
            payment.
          </p>
          {settings.invoice_notes && <p>{settings.invoice_notes}</p>}
        </footer>
      </div>
    </article>
  );
}
