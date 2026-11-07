import { describe, expect, it } from "vitest";
import { normalizeCart, priceCart } from "@/lib/cart";
import { percentOfCents, toCents } from "@/lib/money";

const products = [
  { id: "a", sku: "TSH", name: "Tee", unit: "pcs", price: "15.00", stock: 10, active: true },
  { id: "b", sku: "JNS", name: "Jeans", unit: "pcs", price: 49.99, stock: null, active: true },
  { id: "c", sku: "OLD", name: "Old", unit: "pcs", price: 1, stock: null, active: false },
];

describe("money", () => {
  it("converts to cents without float drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("49.99")).toBe(4999);
  });
  it("rounds tax half away from zero like Postgres", () => {
    expect(percentOfCents(9499, 8)).toBe(760); // 7.5992 -> 7.60
    expect(percentOfCents(1250, 10)).toBe(125);
    expect(percentOfCents(5, 10)).toBe(1); // 0.5 cent -> 1
    expect(percentOfCents(1000, 7.25)).toBe(73); // 72.5 -> 73
  });
});

describe("cart", () => {
  it("merges duplicate lines and drops zero quantities", () => {
    expect(
      normalizeCart([
        { product_id: "a", quantity: 2 },
        { product_id: "b", quantity: 0 },
        { product_id: "a", quantity: 1 },
      ]),
    ).toEqual([{ product_id: "a", quantity: 3 }]);
  });

  it("prices a cart exactly (matches the SQL test: 94.99 + 8% = 102.59)", () => {
    const s = priceCart(
      [
        { product_id: "a", quantity: 3 },
        { product_id: "b", quantity: 1 },
      ],
      products,
      8,
      "USD",
    );
    expect(s.subtotal).toBe(94.99);
    expect(s.tax_amount).toBe(7.6);
    expect(s.total).toBe(102.59);
    expect(s.item_count).toBe(4);
    expect(s.lines.map((l) => l.line_total)).toEqual([45, 49.99]);
  });

  it("skips inactive or unknown products", () => {
    const s = priceCart(
      [
        { product_id: "c", quantity: 1 },
        { product_id: "zzz", quantity: 1 },
      ],
      products,
      0,
      "USD",
    );
    expect(s.lines).toHaveLength(0);
    expect(s.missing).toEqual(["c", "zzz"]);
    expect(s.total).toBe(0);
  });
});
