import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRatesCache,
  convertToBase,
  getCachedRates,
  invertRates,
  isSupportedCurrency,
  currencyMeta,
} from './currency.js';

test('invertRates converts "base per unit" into per-unit values', () => {
  const inverted = invertRates({ USD: 0.0117, EUR: 0.0109 });
  assert.ok(Math.abs(inverted.USD - 85.47) < 0.01);
  assert.ok(Math.abs(inverted.EUR - 91.74) < 0.01);
});

test('invertRates ignores invalid entries', () => {
  const inverted = invertRates({ USD: 0, EUR: -1, GBP: NaN, JPY: 0.5 } as Record<string, number>);
  assert.deepEqual(Object.keys(inverted), ['JPY']);
  assert.equal(inverted.JPY, 2);
});

test('convertToBase returns the amount unchanged for the base currency', () => {
  assert.equal(convertToBase(1000, 'INR', 'INR', undefined), 1000);
  assert.equal(convertToBase(1000, 'inr', 'INR', { USD: 85 }), 1000);
});

test('convertToBase applies the base-per-unit rate', () => {
  assert.equal(convertToBase(10, 'USD', 'INR', { USD: 85.5 }), 855);
  assert.equal(convertToBase(10.555, 'USD', 'INR', { USD: 1 }), 10.56);
});

test('convertToBase returns null when a rate is missing or invalid', () => {
  assert.equal(convertToBase(10, 'EUR', 'INR', { USD: 85.5 }), null);
  assert.equal(convertToBase(10, 'EUR', 'INR', undefined), null);
  assert.equal(convertToBase(10, 'EUR', 'INR', { EUR: 0 }), null);
  assert.equal(convertToBase(NaN, 'EUR', 'INR', { EUR: 90 }), null);
});

test('currency lookups are case-insensitive and bounded to the supported set', () => {
  assert.equal(isSupportedCurrency('usd'), true);
  assert.equal(isSupportedCurrency('INR'), true);
  assert.equal(isSupportedCurrency('AED'), false);
  assert.equal(currencyMeta('eur')?.symbol, '€');
});

test('rate cache is empty until a fetch populates it', () => {
  clearRatesCache();
  assert.equal(getCachedRates('INR'), undefined);
});
