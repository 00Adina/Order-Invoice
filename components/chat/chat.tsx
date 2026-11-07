"use client";

import { Bot, Loader2, Plus, SendHorizontal, ShoppingBag, ShoppingCart, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CartCard, CartLines, ConfirmCard, InvoiceCard } from "@/components/chat/cards";
import { RichText } from "@/components/chat/rich-text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ChatState, DisplayMessage } from "@/lib/types";

const MAX_LEN = 2000;
const SUGGESTIONS = [
  "I want to order 2 white t-shirts and 1 pair of jeans",
  "What do you sell?",
  "Show me your shirts",
  "Do you offer express delivery?",
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

export function Chat({ businessName }: { businessName: string }) {
  const [state, setState] = useState<ChatState | null>(null);
  const [pending, setPending] = useState<DisplayMessage | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<ChatState>("/api/chat")
      .then(setState)
      .catch((e: Error) => {
        toast.error(e.message);
        setState({ status: "active", cart: { lines: [], item_count: 0, subtotal: 0, tax_rate: 0, tax_amount: 0, total: 0, currency_code: "USD" }, customer: {}, messages: [] });
      });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state?.messages.length, pending, sending]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setSending(true);
      setInput("");
      setPending({ id: "pending", role: "user", text: message, created_at: new Date().toISOString() });
      try {
        setState(await api<ChatState>("/api/chat", { method: "POST", body: JSON.stringify({ message }) }));
      } catch (e) {
        toast.error((e as Error).message);
        setInput(message);
      } finally {
        setPending(null);
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [sending],
  );

  const confirm = async () => {
    setConfirming(true);
    try {
      setState(await api<ChatState>("/api/chat/confirm", { method: "POST" }));
      toast.success("Order placed. Your invoice is ready.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  const newOrder = async () => {
    try {
      setState(await api<ChatState>("/api/chat/reset", { method: "POST" }));
      setInput("");
      inputRef.current?.focus();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const messages = state ? [...state.messages, ...(pending ? [pending] : [])] : [];
  const lastConfirmId = [...messages].reverse().find((m) => m.card?.type === "confirm")?.id;
  const completed = state?.status === "completed";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{businessName}</p>
            <p className="text-xs text-muted-foreground">Order assistant</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={newOrder} disabled={sending}>
          <Plus />
          New order
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
              {!state ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-2/3" />
                  <Skeleton className="ml-auto h-10 w-1/2" />
                </div>
              ) : (
                <>
                  <Bubble role="assistant">
                    <p>
                      Hi! I&apos;m the {businessName} order assistant. Tell me what you&apos;d like, for example{" "}
                      <em>&ldquo;2 white t-shirts and a pair of jeans&rdquo;</em>, and I&apos;ll put your order together and send you an invoice.
                    </p>
                  </Bubble>
                  {messages.length === 0 && (
                    <div className="flex flex-wrap gap-2 pl-11">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border bg-card px-3 py-1.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.map((m) => (
                    <Bubble
                      key={m.id}
                      role={m.role}
                      faded={m.id === "pending"}
                      after={
                        <>
                      {m.card?.type === "cart" && <CartCard cart={m.card.cart} />}
                      {m.card?.type === "confirm" && (
                        <ConfirmCard
                          cart={m.card.cart}
                          customer={m.card.customer}
                          active={m.id === lastConfirmId && state.status === "awaiting_confirmation"}
                          busy={confirming || sending}
                          onConfirm={confirm}
                          onEdit={() => {
                            setInput("I'd like to change my order: ");
                            inputRef.current?.focus();
                          }}
                        />
                      )}
                      {m.card?.type === "invoice" && <InvoiceCard order={m.card.order} />}
                        </>
                      }
                    >
                      {m.role === "assistant" ? <RichText text={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                    </Bubble>
                  ))}
                  {sending && (
                    <Bubble role="assistant">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Working on it…
                      </span>
                    </Bubble>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t bg-card/60 px-4 py-3 backdrop-blur">
            <form
              className="mx-auto flex max-w-3xl items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  placeholder={completed ? "Ask about your order, or start a new one" : "Type your order…"}
                  aria-label="Message"
                  className="field-sizing-content max-h-40 min-h-11 w-full resize-none rounded-xl border bg-card px-4 py-2.5 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 md:text-sm"
                  disabled={!state}
                />
              </div>
              <Button type="submit" size="icon" className="size-11 rounded-xl" disabled={!input.trim() || sending || !state} aria-label="Send">
                {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              </Button>
            </form>
            <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">
              Prices and totals are calculated by our system. The assistant can make mistakes, so please review your order before confirming.
            </p>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 border-l bg-card/40 p-5 lg:block">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="size-4 text-primary" />
            Your order
            {state && state.cart.item_count > 0 && (
              <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{state.cart.item_count} items</span>
            )}
          </div>
          {state ? (
            <>
              <CartLines cart={state.cart} />
              {(state.customer.name || state.customer.email) && (
                <div className="mt-6 space-y-0.5 rounded-lg border bg-card p-3 text-sm">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Customer</p>
                  <p className="font-medium">{state.customer.name}</p>
                  <p className="text-muted-foreground">{state.customer.email}</p>
                </div>
              )}
              {completed && (
                <p className="mt-6 rounded-lg bg-success/10 p-3 text-sm text-success">
                  Order placed. Total {formatMoney(state.cart.total, state.cart.currency_code)}.
                </p>
              )}
            </>
          ) : (
            <Skeleton className="h-24" />
          )}
        </aside>
      </div>
    </div>
  );
}

function Bubble({
  role,
  children,
  faded,
  after,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  faded?: boolean;
  after?: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse", faded && "opacity-70")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn("flex max-w-[85%] flex-col", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border bg-card shadow-xs",
          )}
        >
          {children}
        </div>
        {after}
      </div>
    </div>
  );
}
