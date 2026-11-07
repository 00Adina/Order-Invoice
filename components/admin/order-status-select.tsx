"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/app/admin/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

export function OrderStatusSelect({ id, status }: { id: string; status: OrderStatus }) {
  const [pending, start] = useTransition();
  const cancelled = status === "cancelled";
  return (
    <Select
      value={status}
      disabled={pending || cancelled}
      onValueChange={(next) => {
        if (next === "cancelled" && !confirm("Cancel this order? Stock is returned and the invoice is voided. This cannot be undone.")) return;
        start(async () => {
          const r = await updateOrderStatus(id, next);
          if (r.ok) toast.success(`Order marked ${next}`);
          else toast.error(r.error);
        });
      }}
    >
      <SelectTrigger className="w-40 capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORDER_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="capitalize">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
