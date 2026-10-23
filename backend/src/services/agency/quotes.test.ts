import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../utils/AppError.js';
import { saveAgencyQuoteSchema } from '../../schemas/agency.schema.js';
import { buildAgencyUpdate } from './agencies.js';
import {
  computeQuoteTotals,
  effectiveQuoteStatus,
  isQuoteExpired,
  normalizeQuoteTerms,
  parseQuoteValidity,
  projectQuote,
  quoteNumberFor,
} from './quotes.js';

/**
 * A4 pricing rules that must hold without a live database:
 * - totals are derived from quantity/unit price in integer minor units;
 * - the API rejects any client-supplied total;
 * - viewers never receive margin fields;
 * - quote numbers are stable and gap-free in format, not raw counters.
 */

function expectAppError(fn: () => void, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

function validQuoteBody(overrides: Record<string, unknown> = {}) {
  return {
    client: { name: 'Asha Rao', adults: 2, children: 1 },
    currency: 'INR',
    lineItems: [{ label: 'Hotel', quantity: 3, unitPrice: 333.33 }],
    validUntil: '2099-12-31',
    ...overrides,
  };
}

test('quote totals round each step in minor units', () => {
  const totals = computeQuoteTotals({
    lineItems: [
      { label: 'Hotel', quantity: 3, unitPrice: 333.33 },
      { label: 'Guide', quantity: 1, unitPrice: 0.1 },
      { label: 'Water', quantity: 1, unitPrice: 0.2 },
    ],
    markupPct: 12.5,
    taxPct: 18,
    discount: 50,
    adults: 2,
    children: 1,
  });

  assert.equal(totals.lineItems[0].total, 999.99);
  assert.equal(totals.subtotal, 1000.29);
  assert.equal(totals.markupAmount, 125.04);
  assert.equal(totals.discount, 50);
  assert.equal(totals.taxAmount, 193.56);
  assert.equal(totals.total, 1268.89);
  assert.equal(totals.perPerson, 422.96);
  assert.equal(totals.travelers, 3);
});

test('line totals use half-up rounding to two decimals', () => {
  const totals = computeQuoteTotals({
    lineItems: [
      { label: 'Fraction', quantity: 0.5, unitPrice: 0.01 },
      { label: 'Three', quantity: 3, unitPrice: 0.335 },
    ],
    adults: 1,
    children: 0,
  });
  assert.equal(totals.lineItems[0].total, 0.01);
  assert.equal(totals.lineItems[1].total, 1.01);
  assert.equal(totals.subtotal, 1.02);
});

test('a discount cannot exceed subtotal plus markup', () => {
  expectAppError(
    () =>
      computeQuoteTotals({
        lineItems: [{ label: 'Trip', quantity: 1, unitPrice: 100 }],
        markupPct: 10,
        discount: 110.01,
        adults: 1,
        children: 0,
      }),
    400
  );

  const zero = computeQuoteTotals({
    lineItems: [{ label: 'Trip', quantity: 1, unitPrice: 100 }],
    markupPct: 10,
    discount: 110,
    adults: 1,
    children: 0,
  });
  assert.equal(zero.total, 0);
  assert.equal(zero.perPerson, 0);
});

test('travellers must be whole numbers and never total zero', () => {
  expectAppError(
    () =>
      computeQuoteTotals({
        lineItems: [{ label: 'Trip', quantity: 1, unitPrice: 10 }],
        adults: 1.5,
        children: 0,
      }),
    400
  );
  expectAppError(
    () =>
      computeQuoteTotals({
        lineItems: [{ label: 'Trip', quantity: 1, unitPrice: 10 }],
        adults: 0,
        children: 0,
      }),
    400
  );
});

test('the quote endpoint rejects every client-supplied total', () => {
  const withTopLevelTotal = saveAgencyQuoteSchema.safeParse(
    validQuoteBody({ total: 999 })
  );
  assert.equal(withTopLevelTotal.success, false, 'a top-level total must fail');

  const withLineTotal = saveAgencyQuoteSchema.safeParse(
    validQuoteBody({
      lineItems: [
        { label: 'Hotel', quantity: 1, unitPrice: 100, total: 1 },
      ],
    })
  );
  assert.equal(withLineTotal.success, false, 'a line total must fail');

  const withServerFields = saveAgencyQuoteSchema.safeParse(
    validQuoteBody({ subtotal: 1, markupAmount: 1, taxAmount: 1, perPerson: 1 })
  );
  assert.equal(withServerFields.success, false);

  const clean = saveAgencyQuoteSchema.safeParse(validQuoteBody());
  assert.equal(clean.success, true);
});

test('the quote schema bounds percentages and prices', () => {
  assert.equal(
    saveAgencyQuoteSchema.safeParse(validQuoteBody({ markupPct: 1001 })).success,
    false
  );
  assert.equal(
    saveAgencyQuoteSchema.safeParse(validQuoteBody({ taxPct: 101 })).success,
    false
  );
  assert.equal(
    saveAgencyQuoteSchema.safeParse(
      validQuoteBody({
        lineItems: [{ label: 'Hotel', quantity: 1, unitPrice: -1 }],
      })
    ).success,
    false
  );
  assert.equal(
    saveAgencyQuoteSchema.safeParse(validQuoteBody({ currency: 'XYZ' })).success,
    false
  );
});

test('viewers get the client projection without margin fields', () => {
  const quote = {
    _id: 'a'.repeat(24),
    number: 'Q-2026-0001',
    version: 2,
    status: 'sent',
    client: { name: 'Asha', adults: 2, children: 0 },
    currency: 'INR',
    lineItems: [
      { label: 'Hotel', quantity: 1, unitPrice: 100, total: 100 },
    ],
    subtotal: 100,
    markupPct: 15,
    markupAmount: 15,
    taxPct: 5,
    taxAmount: 5.75,
    discount: 0,
    total: 120.75,
    perPerson: 60.38,
    validUntil: new Date('2099-01-01T00:00:00.000Z'),
    inclusions: ['Stay'],
    exclusions: [],
    terms: [],
    preparedBy: 'Agent Secret',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const viewer = projectQuote(quote, 'viewer');
  assert.equal('markupPct' in viewer, false);
  assert.equal('markupAmount' in viewer, false);
  assert.equal('preparedBy' in viewer, false);
  assert.equal('expenses' in viewer, false);
  assert.equal(viewer.total, 120.75);

  const planner = projectQuote(quote, 'planner');
  assert.equal(planner.markupPct, 15);
  assert.equal(planner.markupAmount, 15);
  assert.equal(planner.preparedBy, 'Agent Secret');
});

test('quote numbers are formatted per agency year and sequence', () => {
  assert.equal(quoteNumberFor(2026, 1), 'Q-2026-0001');
  assert.equal(quoteNumberFor(2026, 42), 'Q-2026-0042');
  assert.equal(quoteNumberFor(2026, 12_345), 'Q-2026-12345');
  expectAppError(() => quoteNumberFor(2026, 0), 500);
  expectAppError(() => quoteNumberFor(2026, 1.5), 500);
});

test('expiry only applies to sent quotes and is derived lazily', () => {
  const now = new Date('2026-10-22T12:00:00.000Z');
  const past = new Date('2026-10-21T23:59:59.999Z');
  const future = new Date('2026-10-23T23:59:59.999Z');

  assert.equal(isQuoteExpired({ status: 'sent', validUntil: past }, now), true);
  assert.equal(isQuoteExpired({ status: 'sent', validUntil: future }, now), false);
  assert.equal(isQuoteExpired({ status: 'draft', validUntil: past }, now), false);
  assert.equal(isQuoteExpired({ status: 'expired', validUntil: past }, now), false);

  assert.equal(
    effectiveQuoteStatus({ status: 'sent', validUntil: past }, now),
    'expired'
  );
  assert.equal(
    effectiveQuoteStatus({ status: 'accepted', validUntil: past }, now),
    'accepted'
  );
});

test('date-only validity lasts through the whole day', () => {
  const date = parseQuoteValidity('2026-11-05');
  assert.equal(date.toISOString(), '2026-11-05T23:59:59.999Z');
  expectAppError(() => parseQuoteValidity(''), 400);
  expectAppError(() => parseQuoteValidity('not-a-date'), 400);
});

test('quote terms distinguish inherit from explicit clear', () => {
  assert.equal(normalizeQuoteTerms(undefined, 'inclusions'), undefined);
  assert.deepEqual(normalizeQuoteTerms([], 'inclusions'), []);
  assert.deepEqual(normalizeQuoteTerms([' Stay ', 'Meals'], 'inclusions'), [
    'Stay',
    'Meals',
  ]);
  expectAppError(() => normalizeQuoteTerms([''], 'inclusions'), 400);
  expectAppError(() => normalizeQuoteTerms('Stay', 'inclusions'), 400);
});

test('agency quote defaults are allow-listed and normalised', () => {
  const update = buildAgencyUpdate({
    defaultTerms: {
      inclusions: [' Breakfast ', 'Airport pickup'],
      exclusions: [],
    },
  });
  assert.deepEqual(update.$set['defaultTerms.inclusions'], [
    'Breakfast',
    'Airport pickup',
  ]);
  assert.deepEqual(update.$set['defaultTerms.exclusions'], []);
  assert.equal(update.$set['defaultTerms.terms'], undefined);

  expectAppError(
    () =>
      buildAgencyUpdate({
        defaultTerms: { terms: Array.from({ length: 31 }, () => 'Clause') },
      }),
    400
  );
});
