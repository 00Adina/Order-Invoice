import "server-only";
import { appendExchange, runAgentTurn } from "@/lib/ai/agent";
import type { TurnState } from "@/lib/ai/tools";
import { createSession, loadSession, saveSession, summarizeCart, type ChatSessionRow } from "@/lib/chat/store";
import { serverEnv } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { placeOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import type { BusinessSettings, ChatCard, ChatState, DisplayMessage } from "@/lib/types";

export const SESSION_COOKIE = "chat_sid";
export const MAX_MESSAGE_LENGTH = 2000;

export class LimitError extends Error {}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function message(role: DisplayMessage["role"], text: string, card?: ChatCard): DisplayMessage {
  return { id: crypto.randomUUID(), role, text, card, created_at: new Date().toISOString() };
}

/** The most important card produced during a turn: invoice > confirmation > latest cart. */
function pickCard(cards: ChatCard[]): ChatCard | undefined {
  return (
    cards.find((c) => c.type === "invoice") ??
    [...cards].reverse().find((c) => c.type === "confirm") ??
    [...cards].reverse().find((c) => c.type === "cart")
  );
}

async function toState(row: ChatSessionRow | null, settings: BusinessSettings): Promise<ChatState> {
  return {
    status: row?.status ?? "active",
    cart: await summarizeCart(row?.cart ?? [], settings),
    customer: row?.customer ?? {},
    messages: row?.display ?? [],
  };
}

export async function getChatState(sessionId: string | undefined): Promise<ChatState> {
  const settings = await getSettings();
  const row = sessionId ? await loadSession(sessionId) : null;
  return toState(row, settings);
}

export async function handleCustomerMessage(sessionId: string | undefined, text: string) {
  const env = serverEnv();
  const settings = await getSettings();
  let row = sessionId ? await loadSession(sessionId) : null;
  if (!row) row = await createSession();

  if (row.message_count >= env.CHAT_MAX_MESSAGES_PER_SESSION) {
    throw new LimitError("This chat has reached its message limit. Start a new order to continue.");
  }

  const state: TurnState = {
    sessionId: row.id,
    status: row.status,
    cart: row.cart,
    customer: row.customer,
    notes: row.notes,
    orderId: row.order_id,
    settings,
    appUrl: appUrl(),
    cards: [],
    awaitingAtTurnStart: row.status === "awaiting_confirmation",
    dirty: false,
  };

  const result = await runAgentTurn(row.transcript, text, state);

  // A discarded turn (refusal / truncation) rolls back any cart edits, unless an order was already placed.
  const keepState = result.transcript !== null || state.orderId !== row.order_id;
  const userMsg = message("user", text);
  const botMsg = message("assistant", result.reply, keepState ? pickCard(state.cards) : undefined);

  const saved = await saveSession(row, {
    transcript: result.transcript ?? row.transcript,
    display: [...row.display, userMsg, botMsg],
    cart: keepState ? state.cart : row.cart,
    customer: keepState ? state.customer : row.customer,
    notes: keepState ? state.notes : row.notes,
    status: keepState ? state.status : row.status,
    order_id: state.orderId,
    message_count: row.message_count + 1,
  });

  return { sessionId: saved.id, state: await toState(saved, settings) };
}

/** Confirm button on the summary card: places the order without another AI round trip. */
export async function confirmFromButton(sessionId: string) {
  const settings = await getSettings();
  const row = await loadSession(sessionId);
  if (!row) throw new LimitError("Chat session not found. Please start a new order.");
  if (row.status === "completed") return toState(row, settings);

  const placed = await placeOrder(row.id); // validates status, stock, details; atomic
  const text =
    `Thank you${row.customer.name ? `, ${row.customer.name.split(" ")[0]}` : ""}! Your order ${placed.order_number} is confirmed. ` +
    `Invoice ${placed.invoice_number} for ${formatMoney(placed.total, placed.currency_code)} is ready to download below.`;

  const transcript = appendExchange(row.transcript, "I confirm the order (pressed the Confirm button).", text);

  const saved = await saveSession(row, {
    transcript,
    display: [...row.display, message("user", "Confirm order"), message("assistant", text, { type: "invoice", order: placed })],
    status: "completed",
    order_id: placed.order_id,
  });
  return toState(saved, settings);
}

export async function startNewSession() {
  const settings = await getSettings();
  const row = await createSession();
  return { sessionId: row.id, state: await toState(row, settings) };
}
