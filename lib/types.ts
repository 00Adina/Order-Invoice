export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "completed" | "cancelled";
export type InvoiceStatus = "unpaid" | "paid" | "void";
export type ChatStatus = "active" | "awaiting_confirmation" | "completed";

export const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "completed", "cancelled"];
export const INVOICE_STATUSES: InvoiceStatus[] = ["unpaid", "paid", "void"];

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  kind: "product" | "service";
  price: number | string;
  unit: string;
  stock: number | null;
  aliases: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessSettings {
  id: number;
  business_name: string;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  tax_id: string | null;
  currency_code: string;
  tax_rate: number | string;
  payment_terms_days: number;
  invoice_notes: string | null;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  chat_session_id: string | null;
  status: OrderStatus;
  currency_code: string;
  subtotal: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  total: number | string;
  notes: string | null;
  shipping_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  unit: string;
  unit_price: number | string;
  quantity: number;
  line_total: number | string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  customer_id: string;
  status: InvoiceStatus;
  currency_code: string;
  subtotal: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  total: number | string;
  issue_date: string;
  due_date: string;
  public_token: string;
  paid_at: string | null;
  created_at: string;
}

/** Cart line as persisted on the chat session. Only ids + quantities: prices are always looked up. */
export interface CartEntry {
  product_id: string;
  quantity: number;
}

export interface CustomerDetails {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface CartLine {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  stock: number | null;
}

export interface CartSummary {
  lines: CartLine[];
  item_count: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency_code: string;
}

export interface PlacedOrder {
  order_id: string;
  order_number: string;
  invoice_id: string;
  invoice_number: string;
  invoice_token: string;
  total: number;
  currency_code: string;
  already_placed: boolean;
}

export type ChatCard =
  | { type: "cart"; cart: CartSummary }
  | { type: "confirm"; cart: CartSummary; customer: CustomerDetails }
  | { type: "invoice"; order: PlacedOrder };

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  card?: ChatCard;
  created_at: string;
}

export interface ChatState {
  status: ChatStatus;
  cart: CartSummary;
  customer: CustomerDetails;
  messages: DisplayMessage[];
}
