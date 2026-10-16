import { z } from 'zod';

export const generateItinerarySchema = z.object({
  destination: z.string().min(1, 'Destination is required'),
  days: z.number().int().min(1, 'Days must be at least 1').max(30, 'Days cannot exceed 30'),
  budget: z.coerce.number().min(1, 'Budget must be positive'),
  startdate: z.string().min(1, 'Start date is required'),
  enddate: z.string().min(1, 'End date is required'),
  interests: z.union([z.array(z.string()), z.string()]),
  groupType: z.string().min(1, 'Group type is required'),
});

export const updateTripSchema = z.object({
  title: z.string().optional(),
  status: z.enum(['draft', 'planned', 'ongoing', 'completed']).optional(),
  tripDetails: z.record(z.string(), z.any()).optional(),
});
