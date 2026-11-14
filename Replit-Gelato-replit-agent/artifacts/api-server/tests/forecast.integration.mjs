// Run against a local development API with DATABASE_URL and SESSION_SECRET set.
// Fixtures use unique IDs and are removed even when an assertion fails.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const api = process.env.FORECAST_TEST_API_URL ?? 'http://127.0.0.1:3001/api';
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET, 'Set DATABASE_URL and SESSION_SECRET for local integration checks');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(api).hostname), 'Integration checks must use a local API');
const branchId = randomUUID(), otherBranchId = randomUUID(), managerId = randomUUID(), staffId = randomUUID(), itemId = randomUUID();
const suffix = randomUUID();
function cookie(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 300_000 })).toString('base64url');
  return `gelato_session=${payload}.${createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url')}`;
}
async function request(path, { role = 'manager', ...options } = {}) {
  return fetch(`${api}${path}`, { ...options, headers: { 'Content-Type': 'application/json',
    ...(role ? { Cookie: cookie(role === 'manager' ? managerId : staffId) } : {}), ...options.headers } });
}
const settings = { latitude: 13.7563, longitude: 100.5018, countryCode: 'TH', timezone: 'Asia/Bangkok' };
const path = `/dashboard/scoop-forecast?branchId=${branchId}`;
try {
  await pool.query('INSERT INTO branches(id,name) VALUES ($1,$2),($3,$4)', [branchId, `Forecast check ${suffix}`, otherBranchId, `Forecast other ${suffix}`]);
  await pool.query(`INSERT INTO gelato_users(id,full_name,phone,password_hash,role,branch_id,is_active)
    VALUES ($1,'Forecast Manager',$2,'fixture','manager',$3,true),($4,'Forecast Staff',$5,'fixture','staff',$3,true)`,
    [managerId, `manager-${suffix}`, branchId, staffId, `staff-${suffix}`]);
  assert.equal((await request(path, { role: null })).status, 401);
  assert.equal((await request(path, { role: 'staff' })).status, 403);
  assert.equal((await request('/forecast/locations?q=Bangkok', { role: null })).status, 401);
  assert.equal((await request('/forecast/locations?q=Bangkok', { role: 'staff' })).status, 403);
  assert.equal((await request('/forecast/locations?q=B')).status, 400);
  assert.equal((await request('/forecast/locations')).status, 400);
  assert.equal((await request('/forecast/locations?q=Bangkok&q=Rome')).status, 400);
  assert.equal((await request('/forecast/locations?q=Bangkok&countryCode=THA')).status, 400);
  const cityResponse = await request('/forecast/locations?q=Bangkok&countryCode=TH');
  assert.ok([200, 503].includes(cityResponse.status));
  if (cityResponse.status === 200) {
    const cities = await cityResponse.json();
    assert.ok(cities.locations.length > 0 && cities.locations.length <= 8);
    assert.ok(cities.locations.every((city) => city.countryCode === 'TH' && city.timezone === 'Asia/Bangkok'));
  }
  assert.equal((await request(`/branches/${branchId}/forecast-settings`, { role: 'staff', method: 'PUT', body: JSON.stringify(settings) })).status, 403);
  assert.equal((await request('/dashboard/scoop-forecast?branchId=invalid')).status, 400);
  assert.equal((await request('/dashboard/scoop-forecast')).status, 400);
  assert.equal((await request(`/dashboard/scoop-forecast?branchId=${randomUUID()}`)).status, 404);
  const setup = await (await request(path)).json();
  assert.equal(setup.settings, null); assert.deepEqual(setup.days, []);
  for (const invalid of [{ ...settings, latitude: 91 }, { ...settings, longitude: -181 }, { ...settings, timezone: 'Mars/Olympus' }, { ...settings, timezone: '+07:00' }, { ...settings, countryCode: 'THA' }]) {
    assert.equal((await request(`/branches/${branchId}/forecast-settings`, { method: 'PUT', body: JSON.stringify(invalid) })).status, 400);
  }
  for (let i = 0; i < 2; i++) assert.equal((await request(`/branches/${branchId}/forecast-settings`, { method: 'PUT', body: JSON.stringify(settings) })).status, 200);
  assert.equal((await pool.query('SELECT count(*) FROM gelato_forecast_settings WHERE branch_id=$1', [branchId])).rows[0].count, '1');
  const sparse = await request(path); assert.equal(sparse.status, 200);
  const sparseData = await sparse.json();
  assert.equal(sparseData.days.length, 7); assert.equal(sparseData.history.sufficient, false);
  assert.ok(sparseData.days.every((day) => day.expectedServings === null));
  await pool.query(`INSERT INTO gelato_menu_items(id,name,category,price_cents,ingredients) VALUES ($1,'Forecast Pistachio','Gelato',100,$2)`,
    [itemId, JSON.stringify([{ ingredientName: `Milk-${suffix}`, unit: 'l', quantityPerServing: 0.1 }])]);
  await pool.query('INSERT INTO gelato_menu_availability(branch_id,menu_item_id,quantity) VALUES ($1,$2,5)', [branchId, itemId]);
  await pool.query(`INSERT INTO gelato_stock_lots(branch_id,ingredient_name,quantity,unit,import_date,supplier,shelf_life)
    VALUES ($1,$2,0.5,'l',CURRENT_DATE-30,'Fixture',CURRENT_DATE+30),($1,$2,100,'l',CURRENT_DATE-30,'Fixture',CURRENT_DATE-1)`, [branchId, `Milk-${suffix}`]);
  for (let offset = 1; offset <= 28; offset++) {
    const orderId = randomUUID();
    await pool.query('INSERT INTO gelato_orders(id,branch_id,created_by,total_cents) VALUES ($1,$2,$3,800)', [orderId, branchId, managerId]);
    await pool.query(`INSERT INTO gelato_order_lines(order_id,menu_item_id,menu_item_name,quantity,size,flavor,unit_price_cents,total_cents)
      VALUES ($1,$2,'Forecast Pistachio',8,'regular','pistachio',100,800)`, [orderId, itemId]);
    await pool.query(`INSERT INTO gelato_payments(order_id,method,amount_cents,status,paid_at)
      VALUES ($1,'card',800,'paid',(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date - $2::int) + time '12:00') AT TIME ZONE 'Asia/Bangkok')`, [orderId, offset]);
  }
  // Unpaid and cancelled orders must not change the sales baseline.
  for (const cancelled of [true, false]) {
    const orderId = randomUUID();
    await pool.query('INSERT INTO gelato_orders(id,branch_id,created_by,total_cents,cancelled_at) VALUES ($1,$2,$3,100,$4)', [orderId, branchId, managerId, cancelled ? new Date() : null]);
    await pool.query(`INSERT INTO gelato_order_lines(order_id,menu_item_id,menu_item_name,quantity,size,flavor,unit_price_cents,total_cents)
      VALUES ($1,$2,'Forecast Pistachio',10000,'regular','pistachio',100,100)`, [orderId, itemId]);
    if (cancelled) await pool.query(`INSERT INTO gelato_payments(order_id,method,amount_cents,status,paid_at) VALUES ($1,'card',100,'paid',CURRENT_TIMESTAMP-interval '1 day')`, [orderId]);
  }
  const configured = await request(path); assert.equal(configured.status, 200);
  const data = await configured.json();
  assert.equal(data.history.calendarDays, 28); assert.equal(data.history.sellingDays, 28);
  assert.equal(data.history.totalServings, 224); assert.equal(data.history.sufficient, true);
  for (const day of data.days) assert.equal(day.expectedServings, Math.ceil(8 * (100 + day.adjustmentPercent) / 100));
  assert.equal(data.prep[0].availableServings, 5);
  assert.equal(data.prep[0].extraServings, data.prep[0].targetServings - 5);
  assert.equal(data.ingredientGaps[0].availableQuantity, 0.5);
  assert.equal(data.ingredientGaps[0].requiredQuantity, Math.round(data.prep[0].targetServings * 100) / 1000);
  const other = await (await request(`/dashboard/scoop-forecast?branchId=${otherBranchId}`)).json();
  assert.equal(other.settings, null); assert.equal(other.branchId, otherBranchId);
  console.log(JSON.stringify({ passed: 'API authorization, location validation and persistence, sparse history, paid sale aggregation, cancelled/unpaid exclusion, shared stock and branch isolation', weather: data.weather.status, holidays: data.holidays.status }));
  // Optional local browser callback keeps all fixture lifecycle in this script.
  if (process.env.FORECAST_BROWSER_CHECK) {
    const { checkBrowser } = await import(process.env.FORECAST_BROWSER_CHECK);
    await checkBrowser({ branchId, otherBranchId, managerId, staffId, cookie: cookie(managerId), data });
  }
} finally {
  await pool.query('DELETE FROM gelato_payments WHERE order_id IN (SELECT id FROM gelato_orders WHERE branch_id=$1)', [branchId]);
  await pool.query('DELETE FROM gelato_orders WHERE branch_id=$1', [branchId]);
  await pool.query('DELETE FROM gelato_users WHERE id IN ($1,$2)', [managerId, staffId]);
  await pool.query('DELETE FROM branches WHERE id IN ($1,$2)', [branchId, otherBranchId]);
  await pool.query('DELETE FROM gelato_menu_items WHERE id=$1', [itemId]);
  await pool.end();
}
