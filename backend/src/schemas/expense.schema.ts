import { z } from 'zod';

export const expenseCategorySchema = z.enum([
  'accommodation',
  'food_and_drinks',
  'activities_and_entry',
  'local_transport',
  'miscellaneous_buffer',
  'other',
]);

export const expenseShareSchema = z.object({
  participantId: z.string().min(1),
  amount: z.coerce.number().min(0),
});

export const createExpenseSchema = z.object({
  label: z.string().min(1, 'A short description is required').max(120),
  category: expenseCategorySchema.optional(),
  amount: z.coerce.number().min(0, 'Amount cannot be negative'),
  currency: z.string().min(1).max(8).optional(),
  exchangeRate: z.coerce.number().positive().optional(),
  date: z.coerce.date().optional(),
  day: z.coerce.number().int().min(1).optional(),
  paidBy: z.string().optional(),
  splitMode: z.enum(['none', 'equal', 'custom']).optional(),
  shares: z.array(expenseShareSchema).optional(),
  notes: z.string().max(500).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

/** Body for changing the trip's base currency and/or refreshing FX rates. */
export const financeUpdateSchema = z.object({
  baseCurrency: z.string().min(3).max(8).optional(),
  refresh: z.boolean().optional(),
});

export const participantsSchema = z.object({
  participants: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        isMe: z.boolean().optional(),
      })
    )
    .max(20, 'At most 20 travellers are supported'),
});
