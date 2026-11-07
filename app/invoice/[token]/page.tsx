import { ArrowLeft, Download, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceView } from "@/components/invoice-view";
import { Button } from "@/components/ui/button";
import { getInvoiceByToken } from "@/lib/invoice/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bundle = await getInvoiceByToken(token);
  if (!bundle) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft />
            Back to chat
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/invoices/${token}/pdf?inline=1`} target="_blank" rel="noreferrer">
              <Printer />
              Open PDF
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={`/api/invoices/${token}/pdf`} download>
              <Download />
              Download PDF
            </a>
          </Button>
        </div>
      </div>
      <InvoiceView bundle={bundle} />
    </main>
  );
}
