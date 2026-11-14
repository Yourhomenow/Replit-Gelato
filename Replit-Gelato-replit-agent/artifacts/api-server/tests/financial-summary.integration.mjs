// Set DATABASE_URL and SESSION_SECRET, then run against a local development API.
// Isolated fixture rows are removed in finally, including after failed assertions.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const api = process.env.FINANCE_TEST_API_URL ?? 'http://127.0.0.1:3001/api';
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET, 'Set local DATABASE_URL and SESSION_SECRET');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(api).hostname), 'Use a local development API');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const branchId = randomUUID(), otherBranchId = randomUUID(), managerId = randomUUID(), staffId = randomUUID();
const suffix = randomUUID();
function cookie(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 600_000 })).toString('base64url');
  return `gelato_session=${payload}.${createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url')}`;
}
async function request(params = {}, role = 'manager') {
  return fetch(`${api}/dashboard/financial?${new URLSearchParams(params)}`, {
    headers: role ? { Cookie: cookie(role === 'manager' ? managerId : staffId) } : {},
  });
}
async function report(params) {
  const response = await request({ branchId, ...params });
  assert.equal(response.status, 200);
  return response.json();
}
const fixtures = [
  ['week-before', '2026-11-08T16:59:59.999Z', 100, 'qr'],
  ['week-start', '2026-11-08T17:00:00Z', 200, 'qr'],
  ['week-middle', '2026-11-11T05:00:00Z', 500, 'transfer'],
  ['week-last', '2026-11-15T16:59:59.999Z', 300, 'card'],
  ['week-after', '2026-11-15T17:00:00Z', 400, 'transfer'],
  ['month-before', '2026-07-31T16:59:59.999Z', 1900, 'qr'],
  ['month-start', '2026-07-31T17:00:00Z', 1100, 'qr'],
  ['month-last', '2026-12-31T16:59:59.999Z', 1300, 'card'],
  ['month-after', '2026-12-31T17:00:00Z', 1700, 'qr'],
  ['spring-before', '2026-03-08T07:59:59.999Z', 2100, 'qr'],
  ['spring-start', '2026-03-08T08:00:00Z', 2300, 'qr'],
  ['spring-last', '2026-03-09T06:59:59.999Z', 2900, 'card'],
  ['spring-after', '2026-03-09T07:00:00Z', 3100, 'transfer'],
  ['fall-before', '2026-11-01T06:59:59.999Z', 3300, 'qr'],
  ['fall-start', '2026-11-01T07:00:00Z', 3700, 'qr'],
  ['fall-first-hour', '2026-11-01T08:30:00Z', 4100, 'card'],
  ['fall-second-hour', '2026-11-01T09:30:00Z', 4300, 'card'],
  ['fall-last', '2026-11-02T07:59:59.999Z', 4700, 'transfer'],
  ['fall-after', '2026-11-02T08:00:00Z', 5300, 'qr'],
];
function expected(tags) {
  const rows = fixtures.filter(([tag]) => tags.includes(tag));
  const byMethodCents = { qr: 0, card: 0, transfer: 0 };
  for (const [, , amount, method] of rows) byMethodCents[method] += amount;
  const revenueCents = rows.reduce((sum, [, , amount]) => sum + amount, 0);
  return { revenueCents, paidOrders: rows.length, averageOrderCents: rows.length ? Math.round(revenueCents / rows.length) : 0, byMethodCents };
}
function assertTotals(actual, wanted) {
  for (const [key, value] of Object.entries(wanted)) assert.deepEqual(actual[key], value, key);
}
async function payment(at, amount, method, targetBranch = branchId, status = 'paid') {
  const orderId = randomUUID();
  // Order creation deliberately differs from payment time.
  await pool.query(`INSERT INTO gelato_orders(id,branch_id,created_by,total_cents,created_at) VALUES ($1,$2,$3,$4,'2030-01-01T00:00:00Z')`, [orderId, targetBranch, managerId, amount]);
  await pool.query('INSERT INTO gelato_payments(order_id,method,amount_cents,status,paid_at) VALUES ($1,$2,$3,$4,$5)', [orderId, method, amount, status, at]);
}
try {
  await pool.query('INSERT INTO branches(id,name) VALUES ($1,$2),($3,$4)', [branchId, `Finance check ${suffix}`, otherBranchId, `Finance comparison ${suffix}`]);
  await pool.query(`INSERT INTO gelato_users(id,full_name,phone,password_hash,role,branch_id,is_active)
    VALUES ($1,'Finance Manager',$2,'fixture','manager',$3,true),($4,'Finance Staff',$5,'fixture','staff',$3,true)`,
    [managerId, `finance-manager-${suffix}`, branchId, staffId, `finance-staff-${suffix}`]);
  for (const [, at, amount, method] of fixtures) await payment(at, amount, method);
  await payment('2026-11-11T05:00:00Z', 99000, 'card', branchId, 'pending');
  await payment('2026-11-11T05:00:00Z', 700, 'card', otherBranchId);
  // Cuba repeats midnight; both occurrences belong to the same reporting date.
  for (const [at, amount] of [
    ['2026-11-01T03:59:59.999Z', 10], ['2026-11-01T04:00:00Z', 20],
    ['2026-11-01T04:30:00Z', 30], ['2026-11-01T05:00:00Z', 40],
    ['2026-11-01T05:30:00Z', 50], ['2026-11-02T04:59:59.999Z', 60], ['2026-11-02T05:00:00Z', 70],
    ['2011-12-30T09:59:59.999Z', 80], ['2011-12-30T10:00:00Z', 90],
  ]) await payment(at, amount, 'qr', otherBranchId);
  assert.equal((await request({ branchId }, null)).status, 401);
  assert.equal((await request({ branchId }, 'staff')).status, 403);
  assert.equal((await request({ branchId: randomUUID() })).status, 404);
  for (const invalid of [
    { startDate: '2026-08-01' }, { endDate: '2026-12-31' },
    { startDate: '2026-12-31', endDate: '2026-08-01' },
    { startDate: '2026-02-30', endDate: '2026-03-01' }, { startDate: '', endDate: '' },
    { startDate: '0000-01-01', endDate: '2026-12-31' },
    { timezone: 'Mars/Olympus' }, { timezone: '+07:00' }, { timezone: '' },
  ]) assert.equal((await request({ branchId, ...invalid })).status, 400, JSON.stringify(invalid));
  const repeated = await fetch(`${api}/dashboard/financial?branchId=${branchId}&timezone=UTC&timezone=Asia%2FBangkok`, { headers: { Cookie: cookie(managerId) } });
  assert.equal(repeated.status, 400);
  const all = await report({});
  assertTotals(all, expected(fixtures.map(([tag]) => tag)));
  assert.equal(all.startDate, null); assert.equal(all.endDate, null); assert.equal(all.timezone, 'UTC');
  const week = await report({ startDate: '2026-11-09', endDate: '2026-11-15', timezone: 'Asia/Bangkok' });
  assertTotals(week, expected(['week-start', 'week-middle', 'week-last']));
  assert.equal(week.startDate, '2026-11-09'); assert.equal(week.endDate, '2026-11-15');
  const utcWeek = await report({ startDate: '2026-11-09', endDate: '2026-11-15', timezone: 'UTC' });
  assertTotals(utcWeek, expected(['week-middle', 'week-last', 'week-after']));
  const months = await report({ startDate: '2026-08-01', endDate: '2026-12-31', timezone: 'Asia/Bangkok' });
  assertTotals(months, expected(fixtures.filter(([tag]) => tag.startsWith('week-') || tag.startsWith('fall-') || ['month-start', 'month-last'].includes(tag)).map(([tag]) => tag)));
  assertTotals(await report({ startDate: '2026-11-15', endDate: '2026-11-15', timezone: 'Asia/Bangkok' }), expected(['week-last']));
  assertTotals(await report({ startDate: '2026-03-08', endDate: '2026-03-08', timezone: 'America/Los_Angeles' }), expected(['spring-start', 'spring-last']));
  assertTotals(await report({ startDate: '2026-11-01', endDate: '2026-11-01', timezone: 'America/Los_Angeles' }), expected(['fall-start', 'fall-first-hour', 'fall-second-hour', 'fall-last']));
  const localDay = (date, timezone) => report({ branchId: otherBranchId, startDate: date, endDate: date, timezone });
  const qrTotal = (revenueCents, paidOrders) => ({ revenueCents, paidOrders, averageOrderCents: paidOrders ? Math.round(revenueCents / paidOrders) : 0, byMethodCents: { qr: revenueCents, card: 0, transfer: 0 } });
  assertTotals(await localDay('2026-11-01', 'America/Havana'), qrTotal(200, 5));
  assertTotals(await localDay('2026-10-31', 'America/Havana'), qrTotal(10, 1));
  assertTotals(await localDay('2026-11-02', 'America/Havana'), qrTotal(70, 1));
  assertTotals(await localDay('2011-12-29', 'Pacific/Apia'), qrTotal(80, 1));
  assertTotals(await localDay('2011-12-30', 'Pacific/Apia'), qrTotal(0, 0));
  assertTotals(await localDay('2011-12-31', 'Pacific/Apia'), qrTotal(90, 1));
  assertTotals(await report({ startDate: '2031-01-01', endDate: '2031-01-02', timezone: 'Asia/Bangkok' }), expected([]));
  assertTotals(await report({ branchId: otherBranchId, startDate: '2026-11-09', endDate: '2026-11-15', timezone: 'Asia/Bangkok' }), { revenueCents: 700, paidOrders: 1, averageOrderCents: 700, byMethodCents: { qr: 0, card: 700, transfer: 0 } });
  const global = await request({ startDate: '2026-11-09', endDate: '2026-11-15', timezone: 'Asia/Bangkok' });
  assert.equal(global.status, 200); assert.equal((await global.json()).branchName, 'All branches');
  console.log(JSON.stringify({ passed: 'finance access controls, invalid ranges, paid status, payment-time aggregation, inclusive week/month endpoints, timezone differences, 23/25-hour DST dates, empty periods, branch isolation' }));
  if (process.env.FINANCE_BROWSER_CHECK) {
    const { checkBrowser } = await import(process.env.FINANCE_BROWSER_CHECK);
    await checkBrowser({ branchId, otherBranchId, cookie: cookie(managerId), all, week, months });
  }
} finally {
  await pool.query('DELETE FROM gelato_payments WHERE order_id IN (SELECT id FROM gelato_orders WHERE branch_id IN ($1,$2))', [branchId, otherBranchId]);
  await pool.query('DELETE FROM gelato_orders WHERE branch_id IN ($1,$2)', [branchId, otherBranchId]);
  await pool.query('DELETE FROM gelato_users WHERE id IN ($1,$2)', [managerId, staffId]);
  await pool.query('DELETE FROM branches WHERE id IN ($1,$2)', [branchId, otherBranchId]);
  await pool.end();
}
