INSERT INTO branches (id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Sukhumvit'),
  ('22222222-2222-4222-8222-222222222222', 'Riverside')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gelato_menu_items
  (id, name, description, category, price_cents, recipe, ingredients, storage_guidelines, is_active)
VALUES
  (
    '33333333-3333-4333-8333-333333333331',
    'Madagascar Vanilla',
    'Slow-churned vanilla bean gelato with a clean, creamy finish.',
    'Gelato',
    890,
    'Churn the vanilla base until smooth and dense.',
    '[{"ingredientName":"Vanilla base","quantityPerServing":0.15,"unit":"kg"}]'::jsonb,
    'Keep frozen at -18°C. Temper briefly before service.',
    true
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    'Mango Sorbet',
    'Bright, ripe mango with a refreshing finish.',
    'Sorbet',
    790,
    'Blend mango puree and churn until lightly aerated.',
    '[{"ingredientName":"Mango puree","quantityPerServing":0.15,"unit":"kg"}]'::jsonb,
    'Keep frozen at -18°C. Do not refreeze after service.',
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Pistachio Cream',
    'Roasted pistachio gelato with a smooth, nutty finish.',
    'Gelato',
    1190,
    'Fold pistachio paste through the base before churning.',
    '[{"ingredientName":"Pistachio paste","quantityPerServing":0.15,"unit":"kg"}]'::jsonb,
    'Keep frozen at -18°C. Store separately from allergens.',
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO gelato_menu_availability (branch_id, menu_item_id, quantity)
SELECT branch_id, menu_item_id, 20
FROM (
  VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333331'::uuid),
    ('11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333332'::uuid),
    ('11111111-1111-4111-8111-111111111111'::uuid, '33333333-3333-4333-8333-333333333333'::uuid),
    ('22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333331'::uuid),
    ('22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333332'::uuid),
    ('22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333333'::uuid)
) AS initial_availability(branch_id, menu_item_id)
ON CONFLICT (branch_id, menu_item_id) DO NOTHING;

INSERT INTO gelato_stock_lots
  (id, branch_id, ingredient_name, quantity, unit, import_date, supplier, shelf_life)
VALUES
  ('44444444-4444-4444-8444-444444444441', '11111111-1111-4111-8111-111111111111', 'Vanilla base', 4.5, 'kg', '2026-11-01', 'Creamery Co.', '2026-11-25'),
  ('44444444-4444-4444-8444-444444444442', '11111111-1111-4111-8111-111111111111', 'Mango puree', 4.0, 'kg', '2026-11-02', 'Golden Orchard', '2026-11-20'),
  ('44444444-4444-4444-8444-444444444443', '11111111-1111-4111-8111-111111111111', 'Pistachio paste', 3.0, 'kg', '2026-11-03', 'Nut House', '2026-12-01'),
  ('55555555-5555-4555-8555-555555555551', '22222222-2222-4222-8222-222222222222', 'Vanilla base', 4.5, 'kg', '2026-11-01', 'Creamery Co.', '2026-11-25'),
  ('55555555-5555-4555-8555-555555555552', '22222222-2222-4222-8222-222222222222', 'Mango puree', 4.0, 'kg', '2026-11-02', 'Golden Orchard', '2026-11-20'),
  ('55555555-5555-4555-8555-555555555553', '22222222-2222-4222-8222-222222222222', 'Pistachio paste', 3.0, 'kg', '2026-11-03', 'Nut House', '2026-12-01')
ON CONFLICT (id) DO NOTHING;
