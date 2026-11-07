"use client";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { setInvoicePaid } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus } from "@/lib/types";

export function InvoicePaidButton({ id, status, size = "sm" }: { id: string; status: InvoiceStatus; size?: "sm" | "default" }) {
  const [pending, start] = useTransition();
  if (status === "void") return null;
  const paid = status === "paid";
  return (
    <Button
      variant={paid ? "ghost" : "outline"}
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setInvoicePaid(id, !paid);
          if (r.ok) toast.success(paid ? "Marked unpaid" : "Marked paid");
          else toast.error(r.error);
        })
      }
    >
      {paid ? <RotateCcw /> : <CheckCircle2 />}
      {paid ? "Mark unpaid" : "Mark paid"}
    </Button>
  );
}
