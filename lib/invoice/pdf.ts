import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BusinessSettings, Customer, Invoice, Order, OrderItem } from "@/lib/types";

export interface InvoiceBundle {
  invoice: Invoice;
  order: Order;
  items: OrderItem[];
  customer: Customer;
  settings: BusinessSettings;
}

const PAGE = { w: 595.28, h: 841.89 }; // A4
const M = 48; // margin
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.42, 0.43, 0.47);
const LINE = rgb(0.88, 0.89, 0.91);
const ACCENT = rgb(0.26, 0.22, 0.79);
const ZEBRA = rgb(0.97, 0.97, 0.98);

/** Standard PDF fonts only cover WinAnsi; replace anything else so generation never throws. */
export function toWinAnsi(input: string | null | undefined): string {
  if (!input) return "";
  const map: Record<string, string> = {
    "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
    "…": "...", " ": " ", "₹": "Rs", "₨": "Rs", "\t": " ",
    "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Œ": "OE", "œ": "oe",
  };
  return [...input.normalize("NFC")]
    .map((ch) => {
      if (map[ch] !== undefined) return map[ch];
      const code = ch.codePointAt(0)!;
      if (code === 0x0a) return "\n";
      if (code < 0x20 || /\p{Extended_Pictographic}|\uFE0F/u.test(ch)) return "";
      if (code <= 0x7e || (code >= 0xa1 && code <= 0xff) || "€£¥©®°±µ·×÷•™".includes(ch)) return ch;
      const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return /^[\x20-\x7e]$/.test(stripped) ? stripped : "?";
    })
    .join("");
}

function money(value: number | string, currency: string) {
  const n = Number(value);
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${currency} ${formatted}`;
}

function dateText(d: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d));
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of toWinAnsi(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // hard-break very long words
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

export async function renderInvoicePdf(b: InvoiceBundle): Promise<Uint8Array> {
  const { invoice, order, items, customer, settings } = b;
  const cur = invoice.currency_code;

  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoice.invoice_number}`);
  doc.setAuthor(toWinAnsi(settings.business_name));
  doc.setSubject(`Invoice for order ${order.order_number}`);
  doc.setCreator("AI Order & Invoice");
  doc.setCreationDate(new Date(invoice.created_at));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const text = (s: string, x: number, yy: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(toWinAnsi(s), { x, y: yy, size: opts.size ?? 10, font: opts.font ?? regular, color: opts.color ?? INK });

  const rightText = (s: string, xRight: number, yy: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.font ?? regular;
    const size = opts.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(toWinAnsi(s), size), yy, opts);
  };

  const newPage = () => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    pages.push(page);
    y = PAGE.h - M;
  };

  // ---------- header ----------
  newPage();
  page.drawRectangle({ x: 0, y: PAGE.h - 6, width: PAGE.w, height: 6, color: ACCENT });

  text(settings.business_name, M, y - 16, { size: 18, font: bold });
  let leftY = y - 34;
  const bizLines = [
    ...wrap(settings.business_address ?? "", regular, 9, 260),
    settings.business_email ?? "",
    settings.business_phone ?? "",
    settings.tax_id ? `Tax ID: ${settings.tax_id}` : "",
  ].filter(Boolean);
  for (const l of bizLines) {
    text(l, M, leftY, { size: 9, color: MUTED });
    leftY -= 12;
  }

  const rx = PAGE.w - M;
  rightText("INVOICE", rx, y - 18, { size: 24, font: bold, color: ACCENT });
  const meta: [string, string][] = [
    ["Invoice #", invoice.invoice_number],
    ["Order #", order.order_number],
    ["Issue date", dateText(invoice.issue_date)],
    ["Due date", dateText(invoice.due_date)],
  ];
  let metaY = y - 40;
  for (const [k, v] of meta) {
    rightText(v, rx, metaY, { size: 9, font: bold });
    rightText(k, rx - 110, metaY, { size: 9, color: MUTED });
    metaY -= 13;
  }

  // status badge
  const statusLabel = invoice.status.toUpperCase();
  const badgeColor = invoice.status === "paid" ? rgb(0.09, 0.6, 0.35) : invoice.status === "void" ? MUTED : rgb(0.85, 0.47, 0.04);
  const bw = bold.widthOfTextAtSize(statusLabel, 8) + 14;
  page.drawRectangle({ x: rx - bw, y: metaY - 6, width: bw, height: 15, color: badgeColor });
  text(statusLabel, rx - bw + 7, metaY - 1.5, { size: 8, font: bold, color: rgb(1, 1, 1) });

  y = Math.min(leftY, metaY - 14) - 18;
  page.drawLine({ start: { x: M, y }, end: { x: rx, y }, thickness: 1, color: LINE });
  y -= 22;

  // ---------- bill to ----------
  text("BILL TO", M, y, { size: 8, font: bold, color: MUTED });
  y -= 15;
  text(customer.name, M, y, { size: 11, font: bold });
  y -= 13;
  const custLines = [customer.email, customer.phone ?? "", ...wrap(order.shipping_address ?? customer.address ?? "", regular, 9.5, 280)].filter(Boolean);
  for (const l of custLines) {
    text(l, M, y, { size: 9.5, color: MUTED });
    y -= 12;
  }
  y -= 16;

  // ---------- items table ----------
  const cols = { idx: M + 8, desc: M + 30, qty: rx - 200, unit: rx - 100, amount: rx - 8 };
  const descWidth = cols.qty - cols.desc - 40;

  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 8, width: rx - M, height: 24, color: INK });
    const hc = rgb(1, 1, 1);
    text("#", cols.idx, y, { size: 8.5, font: bold, color: hc });
    text("DESCRIPTION", cols.desc, y, { size: 8.5, font: bold, color: hc });
    rightText("QTY", cols.qty, y, { size: 8.5, font: bold, color: hc });
    rightText("UNIT PRICE", cols.unit, y, { size: 8.5, font: bold, color: hc });
    rightText("AMOUNT", cols.amount, y, { size: 8.5, font: bold, color: hc });
    y -= 26;
  };
  tableHeader();

  items.forEach((item, i) => {
    const nameLines = wrap(item.product_name, bold, 9.5, descWidth);
    const rowH = 22 + nameLines.length * 12;
    if (y - rowH < M + 140) {
      newPage();
      y -= 10;
      tableHeader();
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 14, width: rx - M, height: rowH, color: ZEBRA });
    text(String(i + 1), cols.idx, y, { size: 9, color: MUTED });
    nameLines.forEach((l, li) => text(l, cols.desc, y - li * 12, { size: 9.5, font: bold }));
    text(`SKU ${item.sku} · per ${item.unit}`, cols.desc, y - nameLines.length * 12, { size: 8, color: MUTED });
    rightText(String(item.quantity), cols.qty, y, { size: 9.5 });
    rightText(money(item.unit_price, cur), cols.unit, y, { size: 9.5 });
    rightText(money(item.line_total, cur), cols.amount, y, { size: 9.5, font: bold });
    y -= rowH;
  });

  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: rx, y: y + 6 }, thickness: 1, color: LINE });
  y -= 14;

  // ---------- totals ----------
  if (y < M + 120) newPage();
  const tx = rx - 220;
  const totalRow = (label: string, value: string, strong = false) => {
    text(label, tx, y, { size: strong ? 11 : 9.5, font: strong ? bold : regular, color: strong ? rgb(1, 1, 1) : MUTED });
    rightText(value, rx - 8, y, { size: strong ? 11 : 9.5, font: bold, color: strong ? rgb(1, 1, 1) : INK });
    y -= strong ? 0 : 17;
  };
  totalRow("Subtotal", money(invoice.subtotal, cur));
  totalRow(`Tax (${Number(invoice.tax_rate)}%)`, money(invoice.tax_amount, cur));
  y -= 4;
  page.drawRectangle({ x: tx - 10, y: y - 9, width: rx - tx + 10, height: 26, color: ACCENT });
  totalRow("Total due", money(invoice.total, cur), true);
  y -= 40;

  // ---------- notes ----------
  const notes = [
    order.notes ? `Order notes: ${order.notes}` : "",
    `Payment due by ${dateText(invoice.due_date)}. Please quote ${invoice.invoice_number} with your payment.`,
    settings.invoice_notes ?? "",
  ].filter(Boolean);
  for (const n of notes) {
    for (const l of wrap(n, regular, 9, rx - M)) {
      if (y < M + 20) newPage();
      text(l, M, y, { size: 9, color: MUTED });
      y -= 12;
    }
    y -= 4;
  }

  // ---------- footer on every page ----------
  pages.forEach((p, i) => {
    const footer = `${settings.business_name} · ${invoice.invoice_number} · Page ${i + 1} of ${pages.length}`;
    const s = toWinAnsi(footer);
    p.drawText(s, { x: (PAGE.w - regular.widthOfTextAtSize(s, 8)) / 2, y: 24, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
