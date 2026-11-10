# AI Order Taking & Invoice Generator

Customers chat with an AI assistant (Google Gemini, free tier, or Anthropic Claude) to place orders in plain language. The assistant finds products in your catalog, asks about anything unclear, builds the cart, collects contact details and asks the customer to confirm. On confirmation, the order and a PDF invoice are created. Admins manage products, orders, customers, invoices and settings in a dashboard.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · Supabase (Postgres + Auth) · Google Gen AI SDK (Gemini) or Anthropic SDK (Claude) · pdf-lib · Vercel

---

## How it works

```
Customer ──chat──▶ /api/chat ──▶ Gemini or Claude (tool use) ──▶ tools ──▶ Supabase
                                     │                    search_products / list_catalog
                                     │                    update_cart / view_cart / clear_cart
                                     │                    save_customer_details
                                     │                    request_order_confirmation
                                     ▼                    place_order ──▶ place_order() SQL function
                              reply + cards  ◀───────────────────────────── order + items + invoice
```

Design rules that keep orders correct:

- **The AI never sets prices or does math.** The cart stores only product ids and quantities. Prices, tax and totals are computed on the server in integer cents (`lib/cart.ts`). The final order is priced again inside the `place_order()` Postgres function, in one transaction that locks product rows, checks stock, decrements it, and creates the customer, order, items and invoice.
- **Two-step confirmation.** `request_order_confirmation` shows a summary card. An order can only be placed in a *later* message, after the customer says yes or clicks **Confirm order**, and only if nothing changed since. This is enforced in code (`lib/ai/tools.ts`) and in SQL (`status = 'awaiting_confirmation'`), not just in the prompt.
- **Idempotent.** Confirming twice returns the same order.
- **Secrets stay on the server.** The AI key and the Supabase secret key are read only in server code (`import "server-only"`). Customers never query the database directly. Chat sessions are identified by an httpOnly cookie, and invoices by a random 64-hex-character link token.
- **Row Level Security** is on for every table. Admin pages use the signed-in user's session, and RLS policies grant access only to users listed in `public.admins`.

## Project layout

```
app/
  page.tsx                      Customer chat
  invoice/[token]/page.tsx      Public invoice page (HTML + PDF download)
  login/                        Admin sign-in
  admin/                        Dashboard, orders, products, customers, invoices, settings
  admin/actions.ts              Server actions (zod-validated, admin-checked)
  api/chat/…                    Chat, confirm-button and new-order endpoints
  api/invoices/[token]/pdf      Customer PDF download
  api/admin/invoices/[id]/pdf   Admin PDF download
lib/
  ai/agent.ts                   Picks the AI provider and runs one chat turn
  ai/providers/gemini.ts        Gemini tool-use loop
  ai/providers/anthropic.ts     Claude tool-use loop
  ai/tools.ts                   Tool schemas and handlers (cart, customer, confirmation, order)
  ai/prompt.ts                  System prompt
  chat/                         Session storage and turn orchestration
  invoice/pdf.ts                PDF renderer (pdf-lib)
  cart.ts, money.ts             Exact money and cart math
supabase/
  migrations/…_init.sql         Schema, RLS, search, place_order(), admin_dashboard()
  seed.sql                      Demo store and catalog
proxy.ts                        Session refresh and /admin guard (Next 16 "proxy", formerly middleware)
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema. Either run `supabase db push` with the Supabase CLI linked to your project, or paste `supabase/migrations/20261106000000_init.sql` into **SQL Editor** and run it.
3. Optional: load the demo catalog by running `supabase/seed.sql` the same way.
4. Under **Authentication → Providers**, keep Email enabled. If only admins will sign in, turn off **Allow new users to sign up**.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) and `SUPABASE_SERVICE_ROLE_KEY` (secret key) from Supabase **Project Settings → API Keys**.

Then add **one** AI key:

- **Free:** `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey). No credit card needed. The free tier has rate limits, and Google may use free-tier prompts to improve its products, so don't rely on it for sensitive data at scale.
- **Paid:** `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com).

If both are set, Claude is used unless you set `AI_PROVIDER=gemini`. You can switch providers at any time; ongoing chats keep their visible history.

### 3. Run

```bash
npm install
```

```bash
npm run create-admin -- you@example.com 'a-long-password'
```

```bash
npm run dev
```

The chat is at http://localhost:3000 and the admin dashboard at http://localhost:3000/admin.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel. The framework preset is detected automatically.
2. Add the same environment variables from `.env.example`. Set `NEXT_PUBLIC_APP_URL` to your production URL.
3. Deploy. The chat route sets `maxDuration = 60`, which fits Vercel's default function limits.
4. In Supabase **Authentication → URL Configuration**, set the Site URL to your Vercel domain.

## Testing

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Unit tests: money rounding, cart pricing, PDF rendering and text sanitising |
| `npm run test:db` | Applies the migration to a local Postgres and runs SQL assertions: totals, tax rounding, stock locking, idempotency, cancellation restock, RLS for anon, non-admin and admin |
| `npm run test:integration` | Full chat → order → invoice flow against local Postgres, once with a scripted mock of the Claude API and once with a mock of the Gemini API: tool calls, append-only history, confirmation guard, Confirm button, message limit, refusals, PDF |

`test:db` and `test:integration` need a local PostgreSQL 15+ that `su postgres` can reach. The integration test connects as `postgres:postgres@127.0.0.1`.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | auto | `gemini` or `anthropic`. Auto picks Gemini when only `GEMINI_API_KEY` is set |
| `GEMINI_MODEL` | `gemini-3.8-flash` | If Google doesn't offer this model to your key, the app picks the newest available Flash model automatically and logs which one |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Any current Claude model id |
| `ANTHROPIC_EFFORT` | `low` | `low` keeps chat replies fast. Raise it to `medium` if the assistant mishandles complex orders |
| `CHAT_MAX_MESSAGES_PER_SESSION` | `60` | Abuse guard per chat |

With Claude, requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`). If a safety classifier wrongly declines a normal order message, the request is retried on a recommended fallback model, so the customer isn't stuck.

Business name, address, currency, tax rate, payment terms and invoice footer are edited in **Admin → Settings**. Changes apply to new orders. Existing invoices keep the values they were created with.

## Notes and limits

- PDFs use the built-in Helvetica font, which covers Latin-1 (English and Western European text). Characters outside it, such as Arabic, Urdu or CJK script, show as `?` on the PDF but display correctly on the HTML invoice page. To support them in PDFs, embed a TTF font with `@pdf-lib/fontkit` in `lib/invoice/pdf.ts`.
- Cancelling an order (Admin → order → Status) returns its stock and voids the invoice. A cancelled order can't be reopened.
- The per-session message cap is the only rate limit. For a public launch, add IP-based rate limiting in front of `/api/chat` (for example Vercel WAF or Upstash).
