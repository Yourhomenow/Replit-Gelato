import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFinancialPeriod } from '../src/lib/financial-period.ts';
import { customDates, monthDates, periodLabel, weekDates } from '../../gelato-store/src/lib/financial-period.ts';

test('weeks always include Monday through Sunday, including a Sunday anchor and year crossover', () => {
  for (const anchor of ['2026-11-09', '2026-11-13', '2026-11-15']) {
    assert.deepEqual(weekDates(anchor), { startDate: '2026-11-09', endDate: '2026-11-15' });
  }
  assert.deepEqual(weekDates('2027-01-01'), { startDate: '2026-12-28', endDate: '2027-01-03' });
  assert.deepEqual(weekDates('2026-03-08'), { startDate: '2026-03-02', endDate: '2026-03-08' });
});

test('month ranges include full months, leap days, and both years', () => {
  assert.deepEqual(monthDates('2026-08', '2026-12'), { startDate: '2026-08-01', endDate: '2026-12-31' });
  assert.deepEqual(monthDates('2028-02', '2028-02'), { startDate: '2028-02-01', endDate: '2028-02-29' });
  assert.deepEqual(monthDates('2026-11', '2027-01'), { startDate: '2026-11-01', endDate: '2027-01-31' });
  assert.deepEqual(monthDates('9999-12', '9999-12'), { startDate: '9999-12-01', endDate: '9999-12-31' });
});

test('invalid or reversed selections never produce a reporting period', () => {
  assert.equal(weekDates(''), null);
  assert.equal(weekDates('2026-02-30'), null);
  assert.equal(monthDates('2026-12', '2026-08'), null);
  assert.equal(monthDates('2026-00', '2026-02'), null);
  assert.equal(monthDates('', '2026-02'), null);
  assert.equal(customDates('2026-11-15', '2026-11-09'), null);
  assert.equal(customDates('2026-02-29', '2026-03-01'), null);
  assert.equal(customDates('', '2026-03-01'), null);
  assert.deepEqual(customDates('2026-11-13', '2026-11-13'), { startDate: '2026-11-13', endDate: '2026-11-13' });
});

test('API accepts all time and real calendar dates with an explicit reporting timezone', () => {
  assert.deepEqual(parseFinancialPeriod({}), { startDate: null, endDate: null, timezone: 'UTC' });
  assert.deepEqual(parseFinancialPeriod({ startDate: '2028-02-29', endDate: '2028-02-29', timezone: 'Asia/Bangkok' }),
    { startDate: '2028-02-29', endDate: '2028-02-29', timezone: 'Asia/Bangkok' });
  assert.equal(parseFinancialPeriod({ timezone: 'US/Pacific' })?.timezone, 'America/Los_Angeles');
});

test('API rejects incomplete ranges, date coercion, offsets, and impossible calendar dates', () => {
  for (const query of [
    { startDate: '2026-08-01' }, { endDate: '2026-12-31' }, { startDate: '', endDate: '' },
    { startDate: '2026-02-29', endDate: '2026-03-01' }, { startDate: '0000-01-01', endDate: '2026-12-31' },
    { startDate: '2026-12-31', endDate: '2026-08-01' }, { startDate: ['2026-08-01'], endDate: '2026-12-31' },
    { startDate: '2026-08-01T00:00:00Z', endDate: '2026-12-31' },
    { timezone: ['UTC'] }, { timezone: '' }, { timezone: 'Mars/Olympus' }, { timezone: '+07:00' },
  ]) assert.equal(parseFinancialPeriod(query), null, JSON.stringify(query));
});

test('period labels include years and preserve date strings across local timezones', () => {
  assert.equal(periodLabel(null, null), 'All time');
  assert.equal(periodLabel('2026-08-01', '2026-12-31'), 'Aug 1, 2026 to Dec 31, 2026');
});
