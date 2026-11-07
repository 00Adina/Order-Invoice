-- =====================================================================
-- AI Order Taking & Invoice Generator: initial schema
-- Run with `supabase db push` or paste into the Supabase SQL editor.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.order_status as enum ('pending','confirmed','processing','shipped','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('unpaid','paid','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_status as enum ('active','awaiting_confirmation','completed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Admins (who may use the dashboard)
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Business settings (single row)
-- ---------------------------------------------------------------------
create table if not exists public.business_settings (
  id                 int primary key default 1 check (id = 1),
  business_name      text not null default 'My Store',
  business_email     text,
  business_phone     text,
  business_address   text,
  tax_id             text,
  currency_code      text not null default 'USD' check (char_length(currency_code) = 3),
  tax_rate           numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  payment_terms_days int not null default 7 check (payment_terms_days between 0 and 365),
  invoice_notes      text default 'Thank you for your business!',
  updated_at         timestamptz not null default now()
);
insert into public.business_settings (id) values (1) on conflict do nothing;

drop trigger if exists trg_settings_updated on public.business_settings;
create trigger trg_settings_updated before update on public.business_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Products & services
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  sku         text not null unique check (char_length(sku) between 1 and 64),
  name        text not null check (char_length(name) between 1 and 200),
  description text,
  category    text,
  kind        text not null default 'product' check (kind in ('product','service')),
  price       numeric(12,2) not null check (price >= 0),
  unit        text not null default 'pcs',
  stock       int check (stock is null or stock >= 0), -- null = unlimited (services, made-to-order)
  aliases     text[] not null default '{}',             -- extra words customers use ("tee", "t-shirt")
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_products_active on public.products(active);
create index if not exists idx_products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_customers_email on public.customers (lower(email));

drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Chat sessions (anonymous customers; accessed only by the server with the service role)
-- transcript = raw Claude message history (append-only), display = what the UI renders
-- ---------------------------------------------------------------------
create table if not exists public.chat_sessions (
  id            uuid primary key default gen_random_uuid(),
  transcript    jsonb not null default '[]'::jsonb,
  display       jsonb not null default '[]'::jsonb,
  cart          jsonb not null default '[]'::jsonb,   -- [{product_id, quantity}]
  customer      jsonb not null default '{}'::jsonb,   -- {name,email,phone,address}
  notes         text,
  status        public.chat_status not null default 'active',
  order_id      uuid,
  message_count int not null default 0,
  version       int not null default 0,              -- optimistic concurrency
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_chat_sessions_created on public.chat_sessions(created_at desc);

drop trigger if exists trg_chat_updated on public.chat_sessions;
create trigger trg_chat_updated before update on public.chat_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Orders, items, invoices
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;
create sequence if not exists public.invoice_number_seq start 1001;

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique,
  customer_id     uuid not null references public.customers(id) on delete restrict,
  chat_session_id uuid references public.chat_sessions(id) on delete set null,
  status          public.order_status not null default 'confirmed',
  currency_code   text not null,
  subtotal        numeric(12,2) not null check (subtotal >= 0),
  tax_rate        numeric(5,2) not null default 0,
  tax_amount      numeric(12,2) not null default 0,
  total           numeric(12,2) not null check (total >= 0),
  notes           text,
  shipping_address text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(status);

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  sku          text not null,
  product_name text not null,
  unit         text not null,
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  quantity     int not null check (quantity > 0),
  line_total   numeric(12,2) not null check (line_total >= 0)
);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_product on public.order_items(product_id);

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id       uuid not null unique references public.orders(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  status         public.invoice_status not null default 'unpaid',
  currency_code  text not null,
  subtotal       numeric(12,2) not null,
  tax_rate       numeric(5,2) not null,
  tax_amount     numeric(12,2) not null,
  total          numeric(12,2) not null,
  issue_date     date not null default current_date,
  due_date       date not null,
  public_token   text not null unique check (char_length(public_token) >= 48),
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_invoices_created on public.invoices(created_at desc);

drop trigger if exists trg_invoices_updated on public.invoices;
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

-- When an order is cancelled: put stock back and void the invoice. Un-cancelling is blocked.
create or replace function public.handle_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled order cannot be re-opened';
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.products p
       set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = new.id
       and oi.product_id = p.id
       and p.stock is not null;

    update public.invoices set status = 'void' where order_id = new.id and status <> 'void';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_status on public.orders;
create trigger trg_orders_status after update of status on public.orders
  for each row execute function public.handle_order_status_change();

-- ---------------------------------------------------------------------
-- Product search used by the chatbot (fuzzy, typo tolerant)
-- ---------------------------------------------------------------------
create or replace function public.search_products(q text, lim int default 8)
returns setof public.products
language sql stable set search_path = public, extensions
as $$
  select p.*
    from public.products p
   where p.active
     and (
          p.name ilike '%' || q || '%'
       or p.sku ilike q
       or coalesce(p.category,'') ilike '%' || q || '%'
       or exists (select 1 from unnest(p.aliases) a where a ilike '%' || q || '%' or q ilike '%' || a || '%')
       or extensions.word_similarity(q, p.name) > 0.35
     )
   order by greatest(
              extensions.word_similarity(q, p.name),
              case when p.name ilike '%' || q || '%' then 1 else 0 end
            ) desc,
            p.name
   limit least(greatest(lim, 1), 25);
$$;

-- ---------------------------------------------------------------------
-- place_order: atomically turn a confirmed chat cart into an order + invoice.
-- Prices, tax and totals are computed HERE from the products table — never from AI output.
-- ---------------------------------------------------------------------
create or replace function public.place_order(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session    public.chat_sessions%rowtype;
  v_settings   public.business_settings%rowtype;
  v_customer   public.customers%rowtype;
  v_order_id   uuid;
  v_invoice    public.invoices%rowtype;
  v_subtotal   numeric(12,2) := 0;
  v_tax        numeric(12,2);
  v_total      numeric(12,2);
  v_email      text;
  v_name       text;
  r            record;
begin
  select * into v_session from public.chat_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  -- Idempotent: confirming twice returns the same order.
  if v_session.order_id is not null then
    select * into v_invoice from public.invoices where order_id = v_session.order_id;
    return jsonb_build_object(
      'order_id', v_session.order_id,
      'order_number', (select order_number from public.orders where id = v_session.order_id),
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'invoice_token', v_invoice.public_token,
      'total', v_invoice.total,
      'currency_code', v_invoice.currency_code,
      'already_placed', true
    );
  end if;

  if v_session.status <> 'awaiting_confirmation' then
    raise exception 'NOT_AWAITING_CONFIRMATION';
  end if;

  if jsonb_array_length(v_session.cart) = 0 then
    raise exception 'CART_EMPTY';
  end if;

  v_name  := nullif(trim(v_session.customer->>'name'), '');
  v_email := lower(nullif(trim(v_session.customer->>'email'), ''));
  if v_name is null or v_email is null then
    raise exception 'CUSTOMER_DETAILS_MISSING';
  end if;

  select * into v_settings from public.business_settings where id = 1;

  -- Upsert customer by email
  insert into public.customers (name, email, phone, address)
  values (v_name, v_email,
          nullif(trim(v_session.customer->>'phone'), ''),
          nullif(trim(v_session.customer->>'address'), ''))
  on conflict (lower(email)) do update
     set name    = excluded.name,
         phone   = coalesce(excluded.phone, public.customers.phone),
         address = coalesce(excluded.address, public.customers.address)
  returning * into v_customer;

  v_order_id := gen_random_uuid();

  insert into public.orders (id, order_number, customer_id, chat_session_id, status, currency_code,
                             subtotal, tax_rate, tax_amount, total, notes, shipping_address)
  values (v_order_id,
          'ORD-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
          v_customer.id, v_session.id, 'confirmed', v_settings.currency_code,
          0, v_settings.tax_rate, 0, 0, v_session.notes, v_customer.address);

  -- Every cart line must point at an existing, active product
  if exists (
    select 1
      from jsonb_array_elements(v_session.cart) e
      left join public.products p on p.id = (e->>'product_id')::uuid
     where p.id is null or not p.active
  ) then
    raise exception 'PRODUCT_UNAVAILABLE';
  end if;

  -- Aggregate duplicate lines, lock product rows (stable order avoids deadlocks), validate, insert items
  for r in
    with lines as (
      select (e->>'product_id')::uuid as product_id, sum((e->>'quantity')::int) as qty
        from jsonb_array_elements(v_session.cart) e
       group by 1
    )
    select l.qty, p.*
      from lines l
      join public.products p on p.id = l.product_id
     order by p.id
       for update of p
  loop
    if r.qty is null or r.qty <= 0 or r.qty > 10000 then
      raise exception 'INVALID_QUANTITY:%', r.name;
    end if;
    if r.stock is not null and r.stock < r.qty then
      raise exception 'INSUFFICIENT_STOCK:%:%', r.name, r.stock;
    end if;

    insert into public.order_items (order_id, product_id, sku, product_name, unit, unit_price, quantity, line_total)
    values (v_order_id, r.id, r.sku, r.name, r.unit, r.price, r.qty, round(r.price * r.qty, 2));

    v_subtotal := v_subtotal + round(r.price * r.qty, 2);

    if r.stock is not null then
      update public.products set stock = stock - r.qty where id = r.id;
    end if;
  end loop;

  v_tax   := round(v_subtotal * v_settings.tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;

  update public.orders
     set subtotal = v_subtotal, tax_amount = v_tax, total = v_total
   where id = v_order_id;

  insert into public.invoices (invoice_number, order_id, customer_id, status, currency_code,
                               subtotal, tax_rate, tax_amount, total, issue_date, due_date, public_token)
  values ('INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
          v_order_id, v_customer.id, 'unpaid', v_settings.currency_code,
          v_subtotal, v_settings.tax_rate, v_tax, v_total,
          current_date, current_date + v_settings.payment_terms_days,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  returning * into v_invoice;

  update public.chat_sessions
     set status = 'completed', order_id = v_order_id
   where id = v_session.id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', (select order_number from public.orders where id = v_order_id),
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_token', v_invoice.public_token,
    'total', v_total,
    'currency_code', v_settings.currency_code,
    'already_placed', false
  );
end $$;

revoke all on function public.place_order(uuid) from public, anon, authenticated;
grant execute on function public.place_order(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Admin dashboard aggregates
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'revenue_total',   coalesce((select sum(total) from orders where status <> 'cancelled'), 0),
    'revenue_period',  coalesce((select sum(total) from orders where status <> 'cancelled'
                                   and created_at >= now() - make_interval(days => p_days)), 0),
    'orders_total',    (select count(*) from orders),
    'orders_period',   (select count(*) from orders where created_at >= now() - make_interval(days => p_days)),
    'avg_order_value', coalesce((select round(avg(total), 2) from orders where status <> 'cancelled'), 0),
    'customers_total', (select count(*) from customers),
    'unpaid_total',    coalesce((select sum(total) from invoices where status = 'unpaid'), 0),
    'unpaid_count',    (select count(*) from invoices where status = 'unpaid'),
    'low_stock',       coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock) order by stock)
                                   from products where active and stock is not null and stock <= 5), '[]'::jsonb),
    'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', d::date, 'revenue', coalesce(s.revenue, 0), 'orders', coalesce(s.orders, 0)) order by d)
          from generate_series(current_date - (p_days - 1), current_date, interval '1 day') d
          left join (
            select created_at::date as day, sum(total) as revenue, count(*) as orders
              from orders where status <> 'cancelled'
             group by 1
          ) s on s.day = d::date
      ), '[]'::jsonb),
    'top_products', coalesce((
        select jsonb_agg(t) from (
          select oi.product_name as name, sum(oi.quantity) as quantity, sum(oi.line_total) as revenue
            from order_items oi join orders o on o.id = oi.order_id
           where o.status <> 'cancelled'
           group by oi.product_name
           order by revenue desc
           limit 5
        ) t), '[]'::jsonb)
  ) into v;

  return v;
end $$;

revoke all on function public.admin_dashboard(int) from public, anon;
grant execute on function public.admin_dashboard(int) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- Customers never talk to the DB directly: the chatbot and invoice routes use the
-- service role on the server. Admins use their own session and these policies.
-- ---------------------------------------------------------------------
alter table public.admins            enable row level security;
alter table public.business_settings enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.chat_sessions     enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.invoices          enable row level security;

drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists "settings admin all" on public.business_settings;
create policy "settings admin all" on public.business_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products public read active" on public.products;
create policy "products public read active" on public.products for select to anon, authenticated using (active);

drop policy if exists "products admin all" on public.products;
create policy "products admin all" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers admin all" on public.customers;
create policy "customers admin all" on public.customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "chat admin read" on public.chat_sessions;
create policy "chat admin read" on public.chat_sessions for select to authenticated using (public.is_admin());

drop policy if exists "orders admin all" on public.orders;
create policy "orders admin all" on public.orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order items admin all" on public.order_items;
create policy "order items admin all" on public.order_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invoices admin all" on public.invoices;
create policy "invoices admin all" on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
