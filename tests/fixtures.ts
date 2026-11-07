import type { InvoiceBundle } from "@/lib/invoice/pdf";

export function sampleBundle(itemCount = 3): InvoiceBundle {
  const names = ["Classic White T-Shirt", "Slim Fit Jeans", "Custom Embroidery — “Café” logo", "Grey Hoodie with an extremely long descriptive product name that must wrap onto several lines"];
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    order_id: "o1",
    product_id: `p${i}`,
    sku: `SKU-${i}`,
    product_name: names[i % names.length],
    unit: "pcs",
    unit_price: "15.00",
    quantity: 2,
    line_total: "30.00",
  }));
  const subtotal = 30 * itemCount;
  return {
    invoice: {
      id: "i1", invoice_number: "INV-2026-001001", order_id: "o1", customer_id: "c1", status: "unpaid",
      currency_code: "USD", subtotal, tax_rate: 8, tax_amount: +(subtotal * 0.08).toFixed(2),
      total: +(subtotal * 1.08).toFixed(2), issue_date: "2026-11-06", due_date: "2026-11-13",
      public_token: "x".repeat(64), paid_at: null, created_at: "2026-11-06T10:00:00Z",
    },
    order: {
      id: "o1", order_number: "ORD-001001", customer_id: "c1", chat_session_id: null, status: "confirmed",
      currency_code: "USD", subtotal, tax_rate: 8, tax_amount: 0, total: 0, notes: "Size L for the tees, please.",
      shipping_address: "1 Analytical Way\nLondon NW1", created_at: "2026-11-06T10:00:00Z", updated_at: "2026-11-06T10:00:00Z",
    },
    items,
    customer: { id: "c1", name: "Zoë Ångström", email: "zoe@example.com", phone: "+1 555 0100", address: null, created_at: "2026-11-06T10:00:00Z" },
    settings: {
      id: 1, business_name: "Northwind Apparel", business_email: "billing@northwind.example", business_phone: "+1 (555) 010-2030",
      business_address: "42 Market Street, Springfield, USA", tax_id: "TAX-00-1234567", currency_code: "USD", tax_rate: 8,
      payment_terms_days: 7, invoice_notes: "Thank you for your business! 🙏",
    },
  };
}
