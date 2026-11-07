-- Sample catalog. Safe to re-run.
update public.business_settings
   set business_name = 'Northwind Apparel',
       business_email = 'billing@northwind.example',
       business_phone = '+1 (555) 010-2030',
       business_address = '42 Market Street, Springfield, USA',
       tax_id = 'TAX-00-1234567',
       currency_code = 'USD',
       tax_rate = 8.00,
       payment_terms_days = 7
 where id = 1;

insert into public.products (sku, name, description, category, kind, price, unit, stock, aliases) values
  ('TSH-WHT', 'Classic White T-Shirt', '100% cotton crew neck tee', 'Shirts', 'product', 15.00, 'pcs', 120, '{tee,t-shirt,tshirt,white shirt}'),
  ('TSH-BLK', 'Classic Black T-Shirt', '100% cotton crew neck tee', 'Shirts', 'product', 15.00, 'pcs', 95, '{tee,t-shirt,tshirt,black shirt}'),
  ('SHT-OXF', 'Oxford Button-Down Shirt', 'Long sleeve oxford, light blue', 'Shirts', 'product', 34.50, 'pcs', 40, '{formal shirt,dress shirt,oxford}'),
  ('POL-NVY', 'Navy Polo Shirt', 'Pique cotton polo', 'Shirts', 'product', 24.00, 'pcs', 60, '{polo}'),
  ('JNS-SLM', 'Slim Fit Jeans', 'Dark wash stretch denim', 'Pants', 'product', 49.99, 'pcs', 50, '{jeans,denim,pants}'),
  ('CHN-KHK', 'Khaki Chinos', 'Cotton twill chinos', 'Pants', 'product', 39.00, 'pcs', 35, '{chinos,trousers,pants}'),
  ('HOD-GRY', 'Grey Hoodie', 'Fleece pullover hoodie', 'Outerwear', 'product', 45.00, 'pcs', 30, '{hoodie,sweatshirt,jumper}'),
  ('CAP-BLK', 'Black Baseball Cap', 'Adjustable cotton cap', 'Accessories', 'product', 12.00, 'pcs', 80, '{cap,hat}'),
  ('SOC-3PK', 'Cotton Socks (3-pack)', 'Crew socks, assorted', 'Accessories', 'product', 9.99, 'pack', 200, '{socks}'),
  ('SNK-WHT', 'White Canvas Sneakers', 'Low-top canvas sneakers', 'Footwear', 'product', 59.00, 'pair', 25, '{sneakers,shoes,trainers}'),
  ('SVC-EMB', 'Custom Embroidery', 'Name or logo embroidery, per item', 'Services', 'service', 8.00, 'item', null, '{embroidery,logo,monogram}'),
  ('SVC-GFT', 'Gift Wrapping', 'Premium gift wrap, per order', 'Services', 'service', 5.00, 'order', null, '{gift wrap,wrapping}'),
  ('SVC-EXP', 'Express Delivery', 'Next business day delivery', 'Services', 'service', 14.00, 'order', null, '{express,fast delivery,shipping,next day}')
on conflict (sku) do nothing;
