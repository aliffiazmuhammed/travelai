import { z } from 'zod';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'ta', 'bn', 'te', 'mr', 'kn', 'ml', 'gu'] as const;

export const tripPreferencesSchema = z.object({
  pace: z.enum(['relaxed', 'balanced', 'packed']).optional(),
  dietary: z.array(z.string().min(1)).max(10).optional(),
  avoid: z.array(z.string().min(1)).max(10).optional(),
  accessibility: z.array(z.string().min(1)).max(10).optional(),
});

export const generateItinerarySchema = z.object({
  destination: z.string().min(1, 'Destination is required'),
  days: z.number().int().min(1, 'Days must be at least 1').max(30, 'Days cannot exceed 30'),
  budget: z.coerce.number().min(1, 'Budget must be positive'),
  startdate: z.string().min(1, 'Start date is required'),
  enddate: z.string().min(1, 'End date is required'),
  interests: z.union([z.array(z.string()), z.string()]),
  groupType: z.string().min(1, 'Group type is required'),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  preferences: tripPreferencesSchema.optional(),
});

export const tripFeedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  comment: z.string().max(500, 'Comment cannot exceed 500 characters').optional(),
});

export const updateTripSchema = z.object({
  title: z.string().optional(),
  status: z.enum(['draft', 'planned', 'ongoing', 'completed']).optional(),
  tripDetails: z.record(z.string(), z.any()).optional(),
});

// Editing a single activity within a specific day of the itinerary
export const updateActivitySchema = z.object({
  day: z.number().int().min(1, 'Day number must be at least 1'),
  activityIndex: z.number().int().min(0, 'Activity index cannot be negative'),
  activity: z.record(z.string(), z.any()),
});

// Reordering activities within a single day (order is a permutation of indices)
export const reorderActivitiesSchema = z.object({
  day: z.number().int().min(1, 'Day number must be at least 1'),
  order: z.array(z.number().int().min(0)).min(1, 'At least one activity is required'),
});

// Reordering whole days within the itinerary
export const moveDaySchema = z.object({
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
});

// Restoring a previous version snapshot
export const restoreVersionSchema = z.object({
  note: z.string().max(200, 'Note cannot exceed 200 characters').optional(),
});
