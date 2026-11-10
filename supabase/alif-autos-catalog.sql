-- Alif Autos: business settings + starter catalog (auto parts & oils).
-- Run in the Supabase SQL editor. Safe to re-run: existing products are left as they are.
-- PRICES AND STOCK ARE PLACEHOLDERS: edit them in Admin -> Products after running this.

update public.business_settings
   set business_name      = 'Alif Autos',
       currency_code      = 'PKR',
       tax_rate           = 0,          -- set your sales tax % in Admin -> Settings
       payment_terms_days = 7,
       invoice_notes      = 'Thank you for choosing Alif Autos. Parts can be exchanged within 7 days with this invoice, unused and in original packing.'
 where id = 1;

-- Remove the clothing demo items (only these SKUs; your own products are untouched).
delete from public.products
 where sku in ('TSH-WHT','TSH-BLK','SHT-OXF','POL-NVY','JNS-SLM','CHN-KHK','HOD-GRY',
               'CAP-BLK','SOC-3PK','SNK-WHT','SVC-EMB','SVC-GFT','SVC-EXP');

insert into public.products (sku, name, description, category, kind, price, unit, stock, aliases) values
  -- Engine oils
  ('OIL-5W30-4L',  'Engine Oil 5W-30 Fully Synthetic (4 L)', 'API SP. For most modern petrol cars (check owner''s manual).', 'Engine Oil', 'product', 9500, 'can', 40,
     '{5w30,5w-30,"5w 30",synthetic oil,engine oil,mobil oil,motor oil}'),
  ('OIL-5W30-1L',  'Engine Oil 5W-30 Fully Synthetic (1 L)', 'API SP. Top-up pack.', 'Engine Oil', 'product', 2600, 'can', 60,
     '{5w30,5w-30,"5w 30",synthetic oil,engine oil,mobil oil,top up}'),
  ('OIL-10W40-4L', 'Engine Oil 10W-40 Semi Synthetic (4 L)', 'API SN. For older petrol engines and high mileage cars.', 'Engine Oil', 'product', 7200, 'can', 35,
     '{10w40,10w-40,"10w 40",semi synthetic,engine oil,mobil oil,motor oil}'),
  ('OIL-20W50-4L', 'Engine Oil 20W-50 Mineral (4 L)', 'API SL. For older engines in hot climates.', 'Engine Oil', 'product', 5400, 'can', 30,
     '{20w50,20w-50,"20w 50",mineral oil,engine oil,mobil oil}'),
  ('OIL-15W40-D4L','Diesel Engine Oil 15W-40 (4 L)', 'API CI-4. For diesel cars, pickups and vans.', 'Engine Oil', 'product', 6800, 'can', 25,
     '{15w40,15w-40,diesel oil,engine oil,mobil oil}'),
  -- Other oils & fluids
  ('ATF-DEX3-1L',  'Automatic Transmission Fluid ATF Dexron III (1 L)', 'For automatic gearboxes and power steering that specify Dexron III.', 'Fluids', 'product', 1900, 'bottle', 40,
     '{atf,gear oil automatic,transmission oil,dexron,power steering oil}'),
  ('GEAR-75W90-1L','Manual Gear Oil 75W-90 (1 L)', 'API GL-4 for manual gearboxes.', 'Fluids', 'product', 1700, 'bottle', 30,
     '{gear oil,75w90,75w-90,manual transmission oil}'),
  ('BRK-DOT4-500', 'Brake Fluid DOT 4 (500 ml)', 'Compatible with DOT 3 systems.', 'Fluids', 'product', 1100, 'bottle', 50,
     '{brake oil,brake fluid,dot4,dot 4}'),
  ('COOL-G-1L',    'Coolant Green Ready-to-Use (1 L)', 'Pre-mixed radiator coolant.', 'Fluids', 'product', 950, 'bottle', 50,
     '{coolant,radiator water,antifreeze,radiator coolant}'),
  -- Filters (compatibility in the name)
  ('FLT-OIL-COR',  'Oil Filter - Toyota Corolla 1.3/1.6/1.8 (2009-2024)', 'Spin-on oil filter.', 'Filters', 'product', 950, 'pcs', 60,
     '{oil filter,corolla oil filter,toyota filter}'),
  ('FLT-OIL-CIV',  'Oil Filter - Honda Civic / City (2006-2024)', 'Spin-on oil filter.', 'Filters', 'product', 900, 'pcs', 50,
     '{oil filter,civic oil filter,city oil filter,honda filter}'),
  ('FLT-OIL-SUZ',  'Oil Filter - Suzuki Mehran / Alto / Cultus / Wagon R', 'Spin-on oil filter.', 'Filters', 'product', 650, 'pcs', 80,
     '{oil filter,mehran filter,alto filter,cultus filter,wagon r filter,suzuki filter}'),
  ('FLT-AIR-COR',  'Air Filter - Toyota Corolla (2014-2024)', 'Engine air filter.', 'Filters', 'product', 1600, 'pcs', 30,
     '{air filter,corolla air filter,engine filter}'),
  ('FLT-AIR-CIV',  'Air Filter - Honda Civic (2016-2024)', 'Engine air filter.', 'Filters', 'product', 1800, 'pcs', 25,
     '{air filter,civic air filter,engine filter}'),
  ('FLT-CAB-COR',  'Cabin AC Filter - Toyota Corolla / Yaris', 'Cabin pollen filter.', 'Filters', 'product', 1200, 'pcs', 30,
     '{ac filter,cabin filter,pollen filter,corolla ac filter,yaris ac filter}'),
  -- Brakes
  ('BRK-PAD-COR-F','Front Brake Pads - Toyota Corolla (2014-2024)', 'Set of 4 front pads.', 'Brakes', 'product', 5500, 'set', 20,
     '{brake pads,brake shoes front,corolla brake pads,disc pads}'),
  ('BRK-PAD-CIV-F','Front Brake Pads - Honda Civic (2016-2024)', 'Set of 4 front pads.', 'Brakes', 'product', 6200, 'set', 15,
     '{brake pads,civic brake pads,disc pads}'),
  ('BRK-PAD-SUZ-F','Front Brake Pads - Suzuki Alto / Cultus / Wagon R', 'Set of 4 front pads.', 'Brakes', 'product', 3200, 'set', 25,
     '{brake pads,alto brake pads,cultus brake pads,wagon r brake pads,disc pads}'),
  -- Ignition, electrical, wipers
  ('SPK-IRID-1',   'Iridium Spark Plug (single)', 'Long-life iridium plug. Check fitment for your engine before ordering.', 'Ignition', 'product', 1800, 'pcs', 80,
     '{spark plug,plug,iridium plug,spark plugs}'),
  ('BAT-12V-45AH', 'Car Battery 12V 45Ah', 'Maintenance-free. Fits most small and mid-size cars (check terminal layout).', 'Electrical', 'product', 21000, 'pcs', 8,
     '{battery,car battery,12v battery}'),
  ('WIP-22-PAIR',  'Wiper Blades 22"/16" (pair)', 'Frameless wiper blades, universal hook.', 'Accessories', 'product', 1500, 'pair', 30,
     '{wipers,wiper blade,wiper blades}'),
  -- Services
  ('SVC-OILCHG',   'Oil Change Labour (at shop)', 'Draining old oil and fitting filter. Oil and filter charged separately.', 'Services', 'service', 500, 'service', null,
     '{oil change,service,labour,fitting}'),
  ('SVC-DELIVERY', 'Home Delivery (within city)', 'Delivery to your address within the city.', 'Services', 'service', 300, 'order', null,
     '{delivery,home delivery,shipping,courier}')
on conflict (sku) do nothing;  -- re-running never overwrites prices you've edited
