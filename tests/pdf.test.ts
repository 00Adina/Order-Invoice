import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderInvoicePdf, toWinAnsi } from "@/lib/invoice/pdf";
import { sampleBundle } from "./fixtures";

describe("invoice pdf", () => {
  it("renders a valid single-page PDF", async () => {
    const bytes = await renderInvoicePdf(sampleBundle(3));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Invoice INV-2026-001001");
  });

  it("paginates long invoices", async () => {
    const doc = await PDFDocument.load(await renderInvoicePdf(sampleBundle(60)));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("sanitises text the standard fonts cannot encode", () => {
    expect(toWinAnsi("“Café” — 🙏 ₹")).toBe('"Café" -  Rs');
    expect(toWinAnsi("Łódź")).toBe("Lódz");
    expect(toWinAnsi("日本")).toBe("??");
  });
});
