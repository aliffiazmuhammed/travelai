import { Request, Response } from 'express';
import crypto from 'crypto';
import { generateWithFallback, generateStreamWithFallback } from '../services/ai/index.js';
import { buildPromptText } from '../services/ai/prompt.js';
import Trip from '../models/Trip.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../utils/AppError.js';

function parseItineraryJson(rawResponse: string): Record<string, any> {
  const cleaned = rawResponse
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/m, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract JSON between first '{' and last '}'
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const extracted = cleaned.substring(startIdx, endIdx + 1);
      return JSON.parse(extracted);
    }
    throw new AppError('Failed to parse AI response into JSON', 500);
  }
}

export const generateItinerary = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { destination, days, budget, startdate, enddate, interests, groupType } = req.body;

    const promptText = buildPromptText({
      destination,
      days,
      budget,
      startdate,
      enddate,
      interests,
      groupType,
    });

    const rawResponse = await generateWithFallback(promptText);
    const parsedItinerary = parseItineraryJson(rawResponse);

    const trip = new Trip({
      userId: req.userId,
      title: parsedItinerary.trip_title,
      status: 'planned',
      isDeleted: false,
      tripDetails: parsedItinerary,
    });
    await trip.save();

    res.status(200).json(trip);
  }
);

export const generateItineraryStream = async (req: AuthenticatedRequest, res: Response) => {
  const { destination, days, budget, startdate, enddate, interests, groupType } = req.body;

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (eventData: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  try {
    sendEvent({
      type: 'progress',
      stage: 1,
      progress: 15,
      message: `Analyzing ${destination} weather, seasonal highlights & travel advisory...`,
    });

    const promptText = buildPromptText({
      destination,
      days,
      budget,
      startdate,
      enddate,
      interests,
      groupType,
    });

    let totalCharsReceived = 0;
    let currentStage = 1;

    const fullResponse = await generateStreamWithFallback(promptText, (chunk) => {
      totalCharsReceived += chunk.length;

      if (totalCharsReceived > 600 && currentStage < 2) {
        currentStage = 2;
        sendEvent({
          type: 'progress',
          stage: 2,
          progress: 40,
          message: `Planning ${days}-day detailed activities & optimal timing for ${groupType}...`,
        });
      } else if (totalCharsReceived > 1600 && currentStage < 3) {
        currentStage = 3;
        sendEvent({
          type: 'progress',
          stage: 3,
          progress: 65,
          message: `Discovering authentic local food spots, dhabas & recommended stays...`,
        });
      } else if (totalCharsReceived > 2800 && currentStage < 4) {
        currentStage = 4;
        sendEvent({
          type: 'progress',
          stage: 4,
          progress: 85,
          message: `Optimizing ₹${budget} budget allocation, transport routes & permit notes...`,
        });
      }
    });

    sendEvent({
      type: 'progress',
      stage: 5,
      progress: 95,
      message: 'Validating itinerary structure and formatting...',
    });

    const parsedItinerary = parseItineraryJson(fullResponse);

    const trip = new Trip({
      userId: req.userId,
      title: parsedItinerary.trip_title,
      status: 'planned',
      isDeleted: false,
      tripDetails: parsedItinerary,
    });
    await trip.save();

    sendEvent({
      type: 'complete',
      progress: 100,
      message: 'Your personalized itinerary is ready!',
      trip: trip,
    });

    res.end();
  } catch (error: any) {
    console.error('Streaming generation error:', error);
    sendEvent({
      type: 'error',
      message: error.message || 'Failed to generate itinerary. Please try again.',
    });
    res.end();
  }
};

export const getUserTrips = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { search, status } = req.query;

    const query: Record<string, any> = {
      userId: req.userId,
      isDeleted: { $ne: true },
    };

    if (status && typeof status === 'string' && status !== 'all') {
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { 'tripDetails.trip_title': searchRegex },
      ];
    }

    const trips = await Trip.find(query).sort({ createdAt: -1 });
    res.status(200).json(trips);
  }
);

export const getTripById = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      userId: req.userId,
      isDeleted: { $ne: true },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    res.status(200).json(trip);
  }
);

export const updateTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { title, status, tripDetails } = req.body;

    const trip = await Trip.findOne({
      _id: id,
      userId: req.userId,
      isDeleted: { $ne: true },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    if (title !== undefined) trip.title = title;
    if (status !== undefined) trip.status = status;
    if (tripDetails !== undefined) trip.tripDetails = tripDetails;

    await trip.save();

    res.status(200).json(trip);
  }
);

export const deleteTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      userId: req.userId,
      isDeleted: { $ne: true },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    trip.isDeleted = true;
    await trip.save();

    res.status(200).json({ success: true, message: 'Trip deleted successfully' });
  }
);

export const duplicateTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      userId: req.userId,
      isDeleted: { $ne: true },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    const clonedDetails = JSON.parse(JSON.stringify(trip.tripDetails));
    const originalTitle = trip.title || clonedDetails.trip_title || 'Trip';
    const clonedTitle = `${originalTitle} (Copy)`;
    clonedDetails.trip_title = clonedTitle;

    const newTrip = new Trip({
      userId: req.userId,
      title: clonedTitle,
      status: 'draft',
      isDeleted: false,
      tripDetails: clonedDetails,
    });

    await newTrip.save();

    res.status(201).json(newTrip);
  }
);

export const shareTrip = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const trip = await Trip.findOne({
      _id: id,
      userId: req.userId,
      isDeleted: { $ne: true },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    if (!trip.shareId) {
      trip.shareId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    trip.isPublic = true;
    await trip.save();

    res.status(200).json({
      success: true,
      shareId: trip.shareId,
      message: 'Share link generated successfully',
    });
  }
);

export const getSharedTrip = catchAsync(
  async (req: Request, res: Response) => {
    const { shareId } = req.params;

    const trip = await Trip.findOne({
      shareId,
      isDeleted: { $ne: true },
      isPublic: true,
    });

    if (!trip) {
      throw new AppError('Shared itinerary not found or has been revoked', 404);
    }

    res.status(200).json({
      _id: trip._id,
      title: trip.title,
      status: trip.status,
      tripDetails: trip.tripDetails,
      createdAt: trip.createdAt,
    });
  }
);
