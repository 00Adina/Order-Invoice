import "server-only";
import { renderInvoicePdf, type InvoiceBundle } from "@/lib/invoice/pdf";

export async function pdfResponse(bundle: InvoiceBundle, disposition: "inline" | "attachment") {
  const bytes = await renderInvoicePdf(bundle);
  const filename = `${bundle.invoice.invoice_number}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
