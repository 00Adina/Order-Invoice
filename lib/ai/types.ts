export const MAX_TOOL_ROUNDS = 10;

export const REFUSAL_REPLY = "Sorry, I can't help with that. I can help you browse products, place an order or get an invoice.";
export const SLOW_REPLY = "Sorry, that took me too long. Please send your message again.";
export const RETRY_REPLY = "Sorry, something went wrong on my side. Could you repeat that?";

export interface TurnResult {
  /** Full provider transcript to persist (history + this turn), or null when the turn should be discarded. */
  transcript: unknown[] | null;
  reply: string;
}
