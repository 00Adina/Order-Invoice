-- SQL-level tests for the order pipeline. Run via scripts/test-db.sh (needs local Postgres).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

create or replace function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(expected in sqlerrm) = 0 then
      raise exception 'expected error containing "%" but got "%"', expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected error "%" but statement succeeded: %', expected, stmt;
end $$;

-- ---------- search ----------
select pg_temp.assert((select count(*) from public.search_products('shirt')) >= 3, 'search "shirt" finds shirts');
select pg_temp.assert(exists(select 1 from public.search_products('tee') where sku = 'TSH-WHT'), 'alias "tee" matches t-shirt');
select pg_temp.assert(exists(select 1 from public.search_products('jens') where sku = 'JNS-SLM'), 'typo "jens" matches jeans');

-- ---------- happy path: 2 white tees + 1 jeans + 1 more white tee (duplicate line aggregates) ----------
insert into public.chat_sessions (id, cart, customer, status)
select '00000000-0000-0000-0000-000000000001',
       jsonb_build_array(
         jsonb_build_object('product_id', (select id from products where sku='TSH-WHT'), 'quantity', 2),
         jsonb_build_object('product_id', (select id from products where sku='JNS-SLM'), 'quantity', 1),
         jsonb_build_object('product_id', (select id from products where sku='TSH-WHT'), 'quantity', 1)),
       '{"name":"Ada Lovelace","email":"Ada@Example.com","phone":"555-1234","address":"1 Analytical Way"}',
       'awaiting_confirmation';

create temp table r1 as select public.place_order('00000000-0000-0000-0000-000000000001') as res;

select pg_temp.assert((select (res->>'total')::numeric from r1) = 102.59, 'total = 94.99 + 8% tax (7.60) = 102.59');
select pg_temp.assert((select subtotal from orders) = 94.99, 'subtotal 94.99');
select pg_temp.assert((select tax_amount from orders) = 7.60, 'tax rounds to 7.60');
select pg_temp.assert((select count(*) from order_items) = 2, 'duplicate lines aggregated into 2 items');
select pg_temp.assert((select quantity from order_items where sku='TSH-WHT') = 3, 'white tee qty 3');
select pg_temp.assert((select stock from products where sku='TSH-WHT') = 117, 'stock decremented 120 -> 117');
select pg_temp.assert((select email from customers) = 'ada@example.com', 'email normalised');
select pg_temp.assert((select invoice_number from invoices) like 'INV-____-001001', 'invoice number format');
select pg_temp.assert((select order_number from orders) = 'ORD-001001', 'order number format');
select pg_temp.assert((select char_length(public_token) from invoices) = 64, 'invoice token is 64 hex chars');
select pg_temp.assert((select due_date - issue_date from invoices) = 7, 'due date = issue + payment terms');
select pg_temp.assert((select status from chat_sessions where id='00000000-0000-0000-0000-000000000001') = 'completed', 'session completed');

-- idempotent
select pg_temp.assert((public.place_order('00000000-0000-0000-0000-000000000001')->>'already_placed')::boolean, 'second confirm is idempotent');
select pg_temp.assert((select count(*) from orders) = 1, 'still one order');

-- ---------- guard rails ----------
insert into public.chat_sessions (id, cart, customer, status)
select '00000000-0000-0000-0000-000000000002',
       jsonb_build_array(jsonb_build_object('product_id', (select id from products where sku='SNK-WHT'), 'quantity', 26)),
       '{"name":"Bob","email":"bob@example.com"}', 'awaiting_confirmation';
select pg_temp.expect_error($$select public.place_order('00000000-0000-0000-0000-000000000002')$$, 'INSUFFICIENT_STOCK');
select pg_temp.assert((select stock from products where sku='SNK-WHT') = 25, 'failed order leaves stock untouched');
select pg_temp.assert((select count(*) from orders) = 1, 'failed order rolled back');

insert into public.chat_sessions (id, cart, customer, status)
select '00000000-0000-0000-0000-000000000003',
       jsonb_build_array(jsonb_build_object('product_id', (select id from products where sku='CAP-BLK'), 'quantity', 1)),
       '{"name":"Cy","email":"cy@example.com"}', 'active';
select pg_temp.expect_error($$select public.place_order('00000000-0000-0000-0000-000000000003')$$, 'NOT_AWAITING_CONFIRMATION');

insert into public.chat_sessions (id, cart, customer, status)
select '00000000-0000-0000-0000-000000000004',
       jsonb_build_array(jsonb_build_object('product_id', (select id from products where sku='CAP-BLK'), 'quantity', 1)),
       '{"name":"","email":"dee@example.com"}', 'awaiting_confirmation';
select pg_temp.expect_error($$select public.place_order('00000000-0000-0000-0000-000000000004')$$, 'CUSTOMER_DETAILS_MISSING');

update products set active = false where sku = 'CAP-BLK';
update chat_sessions set customer = '{"name":"Dee","email":"dee@example.com"}' where id = '00000000-0000-0000-0000-000000000004';
select pg_temp.expect_error($$select public.place_order('00000000-0000-0000-0000-000000000004')$$, 'PRODUCT_UNAVAILABLE');
update products set active = true where sku = 'CAP-BLK';

-- services have unlimited stock
insert into public.chat_sessions (id, cart, customer, status)
select '00000000-0000-0000-0000-000000000005',
       jsonb_build_array(jsonb_build_object('product_id', (select id from products where sku='SVC-EMB'), 'quantity', 500)),
       '{"name":"Ada L","email":"ada@example.com"}', 'awaiting_confirmation';
select pg_temp.assert((public.place_order('00000000-0000-0000-0000-000000000005')->>'total')::numeric = 4320.00, 'service order 500*8 + 8% = 4320');
select pg_temp.assert((select count(*) from customers) = 1, 'returning customer re-used by email');
select pg_temp.assert((select name from customers) = 'Ada L', 'customer name updated');

-- ---------- cancellation restocks + voids invoice ----------
update orders set status = 'cancelled' where order_number = 'ORD-001001';
select pg_temp.assert((select stock from products where sku='TSH-WHT') = 120, 'cancel restocks');
select pg_temp.assert((select i.status from invoices i join orders o on o.id=i.order_id where o.order_number='ORD-001001') = 'void', 'cancel voids invoice');
select pg_temp.expect_error($$update orders set status = 'confirmed' where order_number = 'ORD-001001'$$, 'cannot be re-opened');

-- ---------- RLS & privileges ----------
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'admin@example.com'),
  ('10000000-0000-0000-0000-000000000002', 'user@example.com');
insert into public.admins (user_id) values ('10000000-0000-0000-0000-000000000001');

set role anon;
select pg_temp.assert((select count(*) from chat_sessions) = 0, 'anon cannot read chat sessions');
select pg_temp.assert((select count(*) from orders) = 0, 'anon cannot read orders');
select pg_temp.assert((select count(*) from invoices) = 0, 'anon cannot read invoices');
select pg_temp.assert((select count(*) from customers) = 0, 'anon cannot read customers');
select pg_temp.assert((select count(*) from products) = 13, 'anon reads active products');
select pg_temp.expect_error($$select public.place_order('00000000-0000-0000-0000-000000000003')$$, 'permission denied');
select pg_temp.expect_error($$select public.admin_dashboard(30)$$, 'permission denied');
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.assert((select count(*) from orders) = 0, 'non-admin user cannot read orders');
select pg_temp.expect_error($$select public.admin_dashboard(30)$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.place_order('00000000-0000-0000-0000-000000000003')$$, 'permission denied');

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*) from orders) = 2, 'admin reads orders');
select pg_temp.assert((select count(*) from chat_sessions) = 5, 'admin reads chat sessions');
select pg_temp.assert((public.admin_dashboard(30)->>'orders_total')::int = 2, 'dashboard order count');
select pg_temp.assert((public.admin_dashboard(30)->>'revenue_total')::numeric = 4320.00, 'dashboard revenue excludes cancelled');
select pg_temp.assert(jsonb_array_length(public.admin_dashboard(7)->'daily') = 7, 'dashboard daily series length');
update products set price = 16.00 where sku = 'TSH-WHT';
select pg_temp.assert((select price from products where sku='TSH-WHT') = 16.00, 'admin can update products');
reset role;
reset request.jwt.claim.sub;

\echo 'All SQL assertions passed'
