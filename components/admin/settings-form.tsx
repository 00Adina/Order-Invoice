"use client";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettings } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessSettings } from "@/lib/types";

export function SettingsForm({ settings }: { settings: BusinessSettings }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setError(null);
    start(async () => {
      const r = await saveSettings({
        business_name: f.business_name,
        business_email: f.business_email,
        business_phone: f.business_phone,
        business_address: f.business_address,
        tax_id: f.tax_id,
        currency_code: f.currency_code,
        tax_rate: f.tax_rate,
        payment_terms_days: f.payment_terms_days,
        invoice_notes: f.invoice_notes,
      });
      if (r.ok) toast.success("Settings saved");
      else setError(r.error);
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Shown on invoices and used by the chatbot. Changes apply to new orders only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F label="Business name" className="sm:col-span-2">
            <Input name="business_name" required defaultValue={settings.business_name} />
          </F>
          <F label="Billing email">
            <Input name="business_email" type="email" defaultValue={settings.business_email ?? ""} />
          </F>
          <F label="Phone">
            <Input name="business_phone" defaultValue={settings.business_phone ?? ""} />
          </F>
          <F label="Address" className="sm:col-span-2">
            <Textarea name="business_address" defaultValue={settings.business_address ?? ""} />
          </F>
          <F label="Tax / VAT ID">
            <Input name="tax_id" defaultValue={settings.tax_id ?? ""} />
          </F>
          <F label="Currency (ISO code)" hint="e.g. USD, EUR, GBP, PKR">
            <Input name="currency_code" required maxLength={3} className="uppercase" defaultValue={settings.currency_code} />
          </F>
          <F label="Tax rate (%)">
            <Input name="tax_rate" type="number" step="0.01" min="0" max="100" required defaultValue={Number(settings.tax_rate)} />
          </F>
          <F label="Payment terms (days)">
            <Input name="payment_terms_days" type="number" min="0" max="365" required defaultValue={settings.payment_terms_days} />
          </F>
          <F label="Invoice footer note" className="sm:col-span-2">
            <Textarea name="invoice_notes" defaultValue={settings.invoice_notes ?? ""} />
          </F>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function F({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
