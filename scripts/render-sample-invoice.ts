// Writes a sample invoice PDF to disk so the layout can be reviewed without a database.
// Usage: npx tsx scripts/render-sample-invoice.ts [out.pdf]
import { writeFileSync } from "node:fs";
import { renderInvoicePdf } from "../lib/invoice/pdf";
import { sampleBundle } from "../tests/fixtures";

const out = process.argv[2] ?? "sample-invoice.pdf";
renderInvoicePdf(sampleBundle(4)).then((bytes) => {
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.byteLength} bytes)`);
});
