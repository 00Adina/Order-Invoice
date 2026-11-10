# Setup progress

A running checklist for getting this app live. When you come back to Claude, say
**"read SETUP_PROGRESS.md in 00Adina/Order-Invoice and continue"**.

> Never put real keys in this file. It lives in the GitHub repo.

_Last updated: 10 Nov 2026_

## Where things are

| What | Where |
|---|---|
| Code | https://github.com/00Adina/Order-Invoice (branch `main`) |
| Supabase project | `order-invoice` (org `adixgroups`, Free plan, Singapore region) |
| Supabase dashboard | https://supabase.com/dashboard/project/lyvprmbubmtvkmhqwuzm |
| Supabase Project URL | `https://lyvprmbubmtvkmhqwuzm.supabase.co` |
| Supabase API keys page | https://supabase.com/dashboard/project/lyvprmbubmtvkmhqwuzm/settings/api-keys |
| Supabase SQL editor | https://supabase.com/dashboard/project/lyvprmbubmtvkmhqwuzm/sql/new |
| AI provider | Google Gemini (free tier). Key from https://aistudio.google.com/apikey |
| Vercel | Team `Adix` (Hobby), project `order-invoice` |

Your keys are saved in your own Notepad file. If you lose one:
- Publishable / secret key: Supabase API keys page above (copy icons)
- Gemini key: https://aistudio.google.com/apikey (you can create a new one)

## Checklist

### Done
- [x] Code written, tested and pushed to GitHub
- [x] Gemini (free) added as the AI option; Claude still available later
- [x] Supabase project created
- [x] Database tables created (`supabase/migrations/20261106000000_init.sql` ran: "Success. No rows returned")
- [x] Copied Supabase publishable key and secret key
- [x] Vercel account created and `00Adina/Order-Invoice` opened on the import screen

### To check
- [ ] Demo products loaded? In Supabase, open **Table Editor → products**. You should see 13 items.
      If it's empty, run `supabase/seed.sql` in the SQL editor: paste the file **contents**, not the file name.
- [ ] Gemini API key created at https://aistudio.google.com/apikey

### Testing on your own PC (before deploying)
- [ ] Follow **TESTING_GUIDE.md**: Part A runs the app at http://localhost:3000, Part B tests every feature

### Alif Autos setup
- [x] Vercel deploy working: https://order-invoice-omega.vercel.app (env var names fixed to ALL CAPS)
- [x] Gemini "model not found" fixed (new default model + automatic fallback)
- [x] Chat examples and assistant instructions tailored to auto parts & oils
- [ ] Run `supabase/alif-autos-catalog.sql` in the Supabase SQL editor (sets name "Alif Autos", currency PKR, starter parts & oils catalog)
- [ ] Edit placeholder prices and stock in Admin -> Products; set tax rate and address in Admin -> Settings

### Next steps
1. [ ] **Vercel: add environment variables** on the import screen (expand *Environment Variables*):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://lyvprmbubmtvkmhqwuzm.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `sb_publishable_…` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your `sb_secret_…` key |
   | `GEMINI_API_KEY` | your `AIza…` key |

   Leave Framework (Next.js), Root Directory (`./`) and build settings as they are.

2. [ ] Click **Create Project / Deploy** and wait 2–3 minutes. Note the site address, e.g. `https://order-invoice-xxxx.vercel.app`.
   If you leave before this: open https://vercel.com/new and import `Order-Invoice` again. If the project already exists, open it from the Vercel dashboard and add the variables under **Settings → Environment Variables**, then **Deployments → ⋯ → Redeploy**.

3. [ ] **Add the site address to Vercel:** project → **Settings → Environment Variables** → add
   `NEXT_PUBLIC_APP_URL` = your site address (no trailing slash). Then **Deployments → ⋯ → Redeploy**.

4. [ ] **Supabase login settings:** **Authentication → URL Configuration → Site URL** = your site address.

5. [ ] **Create your admin login**
   - Supabase → **Authentication → Users → Add user → Create new user**: your email + a strong password, tick **Auto Confirm User**.
   - SQL editor, run (with your email):
     ```sql
     insert into public.admins (user_id)
     select id from auth.users where email = 'you@example.com';
     ```

6. [ ] **Set up your business:** open `your-site/admin`, sign in, then go to **Settings** and set the business name, address, currency (e.g. `PKR`), tax rate and payment terms.
   Then go to **Products** and replace the demo items with your real ones, or keep them for testing.

7. [ ] **Test an order:** open your site, type e.g. "2 white t-shirts and 1 pair of jeans", give a name and email, click **Confirm order**, then **Download PDF**.
   Check it appears under `/admin` → **Orders** and **Invoices**.

## If something goes wrong
- Chat says *"The assistant is not configured correctly"*: the `GEMINI_API_KEY` in Vercel is missing or wrong.
- Chat says *"busy, try again"*: the Gemini free-tier limit was hit. Wait a minute.
- Admin login loops back to the login page: step 5's SQL hasn't been run for that email.
- Any Vercel build error: take a screenshot of the error and share it with Claude.
