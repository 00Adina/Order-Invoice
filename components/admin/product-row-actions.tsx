"use client";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteProduct, setProductActive } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/types";
import { ProductDialog } from "./product-dialog";

export function ProductRowActions({ product }: { product: Product }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-1">
      <ProductDialog product={product} />
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label={product.active ? "Hide from chatbot" : "Make available"}
        title={product.active ? "Hide from chatbot" : "Make available"}
        onClick={() =>
          start(async () => {
            const r = await setProductActive(product.id, !product.active);
            if (!r.ok) toast.error(r.error);
          })
        }
      >
        {product.active ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label={`Delete ${product.name}`}
        className="text-destructive hover:text-destructive"
        onClick={() => {
          if (!confirm(`Delete "${product.name}"? Past orders keep their copy of the item.`)) return;
          start(async () => {
            const r = await deleteProduct(product.id);
            if (r.ok) toast.success("Product deleted");
            else toast.error(r.error);
          });
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
