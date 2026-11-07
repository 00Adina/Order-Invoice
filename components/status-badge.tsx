import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, OrderStatus } from "@/lib/types";

const ORDER: Record<OrderStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  pending: "warning",
  confirmed: "info",
  processing: "info",
  shipped: "info",
  completed: "success",
  cancelled: "destructive",
};
const INVOICE: Record<InvoiceStatus, "warning" | "success" | "secondary"> = { unpaid: "warning", paid: "success", void: "secondary" };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER[status]} className="capitalize">{status}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={INVOICE[status]} className="capitalize">{status}</Badge>;
}
