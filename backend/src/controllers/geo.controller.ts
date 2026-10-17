import { Response } from 'express';
import { computeRoute } from '../services/geo/route.js';
import { LatLng, TravelMode } from '../services/geo/distance.js';
import { getWeatherForecast } from '../services/geo/weather.js';
import { NEARBY_CATEGORIES, findNearbyPlaces } from '../services/geo/nearby.js';
import { fetchBasePerUnitRates } from '../services/finance/currency.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { parseQuery } from '../utils/parseQuery.js';
import { nearbyQuerySchema, weatherQuerySchema } from '../schemas/geo.schema.js';
import { AuthenticatedRequest } from '../types/index.js';

/**
 * Computes distance + travel time for a sequence of coordinates.
 * POST /api/geo/route
 */
export const computeTripRoute = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { points, mode } = req.body as {
      points: LatLng[];
      mode?: TravelMode;
    };

    const result = await computeRoute(points, mode || 'drive');

    res.status(200).json({ success: true, ...result });
  }
);

/**
 * Returns base-per-unit FX rates for the requested currencies.
 * `rates[USD]` is the value of 1 USD expressed in the base currency.
 * GET /api/geo/currency/rates?base=INR&symbols=USD,EUR
 */
export const getCurrencyRates = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const base = String(req.query.base || 'INR').toUpperCase();
    const symbolsParam = req.query.symbols;
    const symbols =
      typeof symbolsParam === 'string' && symbolsParam.trim()
        ? symbolsParam
            .split(',')
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean)
        : undefined;

    try {
      const snapshot = await fetchBasePerUnitRates(base, symbols);
      res.status(200).json({ success: true, ...snapshot });
    } catch {
      throw new AppError(
        'Exchange rates are temporarily unavailable. Please try again shortly.',
        502
      );
    }
  }
);

/**
 * Per-day weather forecast with risk levels and travel advisories.
 * GET /api/geo/weather?lat&lng&start&end
 */
export const getWeather = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { lat, lng, start, end } = parseQuery(weatherQuerySchema, req.query);
    const forecast = await getWeatherForecast(lat, lng, start, end);

    res.status(200).json({ success: true, ...forecast });
  }
);

/**
 * Nearby POIs (restaurants, cafés, ATMs, pharmacies, fuel, attractions).
 * GET /api/geo/nearby?lat&lng&category&radius
 */
export const getNearby = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { lat, lng, category, radius } = parseQuery(nearbyQuerySchema, req.query);
    const result = await findNearbyPlaces(lat, lng, category, radius);

    res.status(200).json({ success: true, ...result, categories: NEARBY_CATEGORIES });
  }
);
