import { fromCents, percentOfCents, toCents } from "@/lib/money";
import type { CartEntry, CartSummary, Product } from "@/lib/types";

export const MAX_LINE_QUANTITY = 10000;
export const MAX_CART_LINES = 50;

/** Merge duplicate product lines and drop zero quantities. */
export function normalizeCart(entries: CartEntry[]): CartEntry[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.product_id, (map.get(e.product_id) ?? 0) + e.quantity);
  }
  return [...map.entries()]
    .filter(([, q]) => q > 0)
    .map(([product_id, quantity]) => ({ product_id, quantity }));
}

/**
 * Price a cart from authoritative product rows. Products missing from `products`
 * (deleted / deactivated) are skipped and reported in `missing`.
 */
export function priceCart(
  entries: CartEntry[],
  products: Pick<Product, "id" | "sku" | "name" | "unit" | "price" | "stock" | "active">[],
  taxRatePercent: number,
  currency: string,
): CartSummary & { missing: string[] } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing: string[] = [];
  let subtotalCents = 0;
  let itemCount = 0;

  const lines = normalizeCart(entries).flatMap((e) => {
    const p = byId.get(e.product_id);
    if (!p || !p.active) {
      missing.push(e.product_id);
      return [];
    }
    const unitCents = toCents(p.price);
    const lineCents = unitCents * e.quantity;
    subtotalCents += lineCents;
    itemCount += e.quantity;
    return [
      {
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        unit_price: fromCents(unitCents),
        quantity: e.quantity,
        line_total: fromCents(lineCents),
        stock: p.stock,
      },
    ];
  });

  const taxCents = percentOfCents(subtotalCents, taxRatePercent);
  return {
    lines,
    item_count: itemCount,
    subtotal: fromCents(subtotalCents),
    tax_rate: taxRatePercent,
    tax_amount: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
    currency_code: currency,
    missing,
  };
}

export function emptyCart(currency: string, taxRate: number): CartSummary {
  return { lines: [], item_count: 0, subtotal: 0, tax_rate: taxRate, tax_amount: 0, total: 0, currency_code: currency };
}
