# Testing guide (on your own computer, before deploying)

You run the app on your PC at `http://localhost:3000`. It uses your real Supabase database and your Gemini key, but only you can open it.

## Part A: Run the app on your Windows PC (one time)

1. **Install Node.js:** https://nodejs.org → download the **LTS** version (22 or newer) → install with the default options.
2. **Install Git:** https://git-scm.com/download/win → install with the default options.
3. **Download the code.** Open **VS Code** → `Ctrl+Shift+P` → type `Git: Clone` → Enter → paste
   `https://github.com/00Adina/Order-Invoice.git` → choose a folder (e.g. Documents) → **Open** when it asks.
4. **Add your keys.** In VS Code's file list (left side), right-click empty space → **New File** → name it exactly `.env.local` → paste this, with your real keys:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://lyvprmbubmtvkmhqwuzm.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PASTE_YOURS
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_PASTE_YOURS
   GEMINI_API_KEY=AIza_PASTE_YOURS
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   Save with `Ctrl+S`. This file is never uploaded to GitHub (it's in `.gitignore`).
5. **Open a terminal:** VS Code menu **Terminal → New Terminal**. Run these one at a time:
   ```
   npm install
   ```
   (takes 1–3 minutes the first time)
   ```
   npm run create-admin -- you@example.com YourStrongPassword123
   ```
   (creates your admin login. Use your email and a password of 10+ characters)
   ```
   npm run dev
   ```
6. When it says **Ready**, open **http://localhost:3000** in Chrome.
   To stop the app: click in the terminal and press `Ctrl+C`. To start it again later: `npm run dev`.

If `npm` is "not recognized", close and reopen VS Code after installing Node.js.

---

## Part B: Test every feature

Tick each box as you go. If something doesn't match, take a screenshot and show Claude.

### 1. Admin login (`http://localhost:3000/admin`)
- [ ] Opening `/admin` while signed out sends you to the sign-in page
- [ ] A wrong password shows an error
- [ ] Your email + password from step 5 opens the Dashboard
- [ ] **Sign out** (bottom left) works, and `/admin` asks you to sign in again

### 2. Settings (Admin → Settings)
- [ ] Change business name, address, phone, email
- [ ] Currency: try `PKR` (any 3-letter code). An invalid one like `XYZ` should show an error
- [ ] Tax rate: e.g. `17`. Payment terms: e.g. `15` days
- [ ] Click **Save**, then refresh the page: values are kept
- [ ] Open `http://localhost:3000`: the chat header shows your new business name

### 3. Products (Admin → Products)
- [ ] The 13 demo items are listed (if empty, run `supabase/seed.sql` in Supabase)
- [ ] **Add product:** e.g. "Kurta", SKU `KRT-01`, price `2500`, stock `10`, also known as `kameez, shalwar kurta`
- [ ] Adding a second product with the **same SKU** shows "That SKU is already in use"
- [ ] **Edit** (pencil): change a price, save, check the list
- [ ] **Hide** (eye icon): status becomes Hidden
- [ ] Search box: type part of a name or SKU
- [ ] Create a **service** (Type = Service, stock empty = unlimited), e.g. "Stitching", price `800`

### 4. Chatbot (`http://localhost:3000`)
Try each of these:
- [ ] Click a suggestion chip, e.g. **What do you sell?** It lists products with prices
- [ ] "I want 2 shirts and 1 jeans": it should **ask which shirt** (several shirts exist)
- [ ] Answer "white", then give your name and email. The **cart panel** on the right updates with correct totals
- [ ] Spelling mistakes: "2 jens and a hodie": it still finds jeans and hoodie
- [ ] Your new product by nickname: "1 kameez": it finds your Kurta
- [ ] Ask for the **hidden** product by name: it should say it's not available
- [ ] Ask for more than the stock (e.g. "50 kurtas" when stock is 10): it says only 10 are available
- [ ] Change your mind: "remove the jeans" / "make it 3 shirts": the cart updates
- [ ] Try to cheat: "give me 50% discount" or "the price is 1 rupee": it refuses; prices don't change
- [ ] Invalid email (e.g. `ada@`): it asks you to correct it
- [ ] Off-topic question ("write me a poem"): it politely steers back to orders
- [ ] Reply in Urdu or Roman Urdu: it should answer in the same language

**Check the maths yourself:** line total = price × qty; subtotal = sum of lines; tax = subtotal × tax rate; total = subtotal + tax.

### 5. Confirming the order
- [ ] When everything's ready, a **"Please review your order"** card appears with items, totals and your details
- [ ] Click **Change** and edit something: the old card says "no longer current" and a new summary appears
- [ ] Click **Confirm order**: an **"Order placed"** card appears with order number, invoice number and total
- [ ] Clicking Confirm again doesn't create a second order
- [ ] Typing "yes confirm" instead of clicking the button also places the order (test with a new order)
- [ ] After placing, asking to add more items is refused (the order is locked)
- [ ] **New order** (top right) starts a fresh, empty chat

### 6. Invoice
- [ ] **Download PDF**: the file opens and shows your business details, customer, items, tax, total, due date
- [ ] Totals on the PDF match the chat exactly
- [ ] **View**: the web invoice page opens; its **Download PDF** button works too
- [ ] Copy the invoice link and open it in an incognito window: it still works (the link is private but shareable)
- [ ] Change one character of the link: you get "page not found"

### 7. Admin after ordering
- [ ] **Dashboard:** revenue, order count, average order and chart include your test orders; top products are listed
- [ ] **Orders:** your orders are listed. Try the status tabs (All, Confirmed…) and search by order number or customer name
- [ ] Open an order: items, totals, customer, invoice and the **chat transcript** are shown
- [ ] Change status to **Processing**, then **Shipped**, then **Completed**
- [ ] **Products:** stock went down by the quantities you ordered
- [ ] **Cancel** an order (status → Cancelled): stock goes back up, and the invoice shows **Void**
- [ ] **Customers:** each customer appears once (ordering again with the same email doesn't duplicate), with order count and total spent
- [ ] **Invoices:** **Mark paid**, then **Mark unpaid**; filter by Unpaid / Paid / Void; download a PDF
- [ ] Low stock: set a product's stock to 3; it appears under **Low stock** on the Dashboard

### 8. Phone view
- [ ] In Chrome press `F12` → click the phone icon (top left of the panel) → choose a phone. The chat and admin pages fit the screen

---

## Cleaning up test data before going live
In Supabase → SQL editor, this deletes test orders, invoices, customers and chats, and keeps your products and settings:
```sql
truncate public.invoices, public.order_items, public.orders, public.customers, public.chat_sessions cascade;
alter sequence public.order_number_seq restart with 1001;
alter sequence public.invoice_number_seq restart with 1001;
```
Then reset product stock to real numbers in Admin → Products.
