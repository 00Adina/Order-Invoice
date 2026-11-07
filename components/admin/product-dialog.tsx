"use client";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveProduct, type ProductFormValues } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/lib/types";

export function ProductDialog({ product }: { product?: Product }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"product" | "service">(product?.kind ?? "product");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values: ProductFormValues = {
      id: product?.id,
      sku: String(f.get("sku") ?? ""),
      name: String(f.get("name") ?? ""),
      description: String(f.get("description") ?? ""),
      category: String(f.get("category") ?? ""),
      kind,
      price: String(f.get("price") ?? ""),
      unit: String(f.get("unit") ?? ""),
      stock: String(f.get("stock") ?? ""),
      aliases: String(f.get("aliases") ?? ""),
      active: f.get("active") === "on",
    };
    setError(null);
    start(async () => {
      const res = await saveProduct(values);
      if (res.ok) {
        toast.success(product ? "Product updated" : "Product created");
        setOpen(false);
      } else setError(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        {product ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${product.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Add product
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product or service"}</DialogTitle>
          <DialogDescription>The chatbot uses these details and prices when taking orders.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input name="name" required maxLength={200} defaultValue={product?.name} />
          </Field>
          <Field label="SKU">
            <Input name="sku" required maxLength={64} defaultValue={product?.sku} className="uppercase" />
          </Field>
          <Field label="Type">
            <Select value={kind} onValueChange={(v) => setKind(v as "product" | "service")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Price">
            <Input name="price" type="number" step="0.01" min="0" required defaultValue={product ? Number(product.price).toFixed(2) : ""} />
          </Field>
          <Field label="Unit" hint="e.g. pcs, pair, hour">
            <Input name="unit" required maxLength={30} defaultValue={product?.unit ?? "pcs"} />
          </Field>
          <Field label="Stock" hint="Leave empty for unlimited">
            <Input name="stock" type="number" step="1" min="0" defaultValue={product?.stock ?? ""} />
          </Field>
          <Field label="Category">
            <Input name="category" maxLength={100} defaultValue={product?.category ?? ""} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" maxLength={2000} defaultValue={product?.description ?? ""} />
          </Field>
          <Field label="Also known as" hint="Comma-separated words customers might use (tee, t-shirt)" className="sm:col-span-2">
            <Input name="aliases" defaultValue={product?.aliases?.join(", ") ?? ""} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="size-4 accent-primary" />
            Available for ordering
          </label>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {product ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
