import { API_BASE_URL } from '@/config';
import type {
  Trip,
  TripInput,
  User,
  TripVersionsResponse,
  TripVersionDetails,
  TripFeedback,
  TripInsights,
  ActivityItem,
  RouteResult,
  RouteInput,
  CurrencyRateSnapshot,
  ExpenseInput,
  TripExpense,
  TripParticipant,
  TripFinance,
  WeatherResponse,
  NearbyCategory,
  NearbyResponse,
  DayAlternative,
  WeatherRoutingResponse,
} from '@/types';

export interface StreamProgressEvent {
  stage: number;
  progress: number;
  message: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch {
      throw new Error(
        'Unable to connect to the server. Please check your internet connection or try again shortly.'
      );
    }

    let data: any = {};
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        }
        if (response.status >= 500) {
          throw new Error('Our servers are temporarily unavailable. Please try again shortly.');
        }
        throw new Error('The server returned an unexpected response. Please try again.');
      }
      return {} as T;
    }

    if (!response.ok) {
      const detailMsg = Array.isArray(data.details) && data.details.length > 0 ? data.details[0] : '';
      const message =
        detailMsg ||
        data.error ||
        data.message ||
        (response.status >= 500
          ? 'Something went wrong on our end. Please try again in a few moments.'
          : 'Request could not be completed. Please try again.');
      throw new Error(message);
    }

    return data;
  }

  /**
   * Like `request`, but for `FormData` bodies. The browser must set the
   * multipart boundary itself, so no `Content-Type` header is added here.
   */
  private async requestForm<T>(endpoint: string, body: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body,
      });
    } catch {
      throw new Error(
        'Unable to connect to the server. Please check your internet connection or try again shortly.'
      );
    }

    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('That file is too large to upload.');
        }
        if (response.status >= 500) {
          throw new Error('Our servers are temporarily unavailable. Please try again shortly.');
        }
        throw new Error('The server returned an unexpected response. Please try again.');
      }
      return {} as T;
    }

    if (!response.ok) {
      const payload = (data ?? {}) as { error?: string; message?: string };
      throw new Error(
        payload.error || payload.message || 'We could not upload that receipt. Please try again.'
      );
    }

    return data as T;
  }

  // Auth endpoints
  async getMe(): Promise<{ user: User }> {
    return this.request('/api/auth/me');
  }

  async signup(email: string, password: string): Promise<{ user: User }> {
    return this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async signin(email: string, password: string): Promise<{ user: User }> {
    return this.request('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<{ message: string }> {
    return this.request('/api/auth/logout', {
      method: 'POST',
    });
  }

  // Trip endpoints
  async generateItinerary(input: TripInput): Promise<Trip> {
    return this.request('/api/itinerary/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async generateItineraryStream(
    input: TripInput,
    callbacks: {
      onProgress: (data: StreamProgressEvent) => void;
      onComplete: (trip: Trip) => void;
      onError: (errorMessage: string) => void;
    }
  ): Promise<void> {
    const url = `${this.baseUrl}/api/itinerary/generate-stream`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        let errMessage = 'Unable to begin itinerary generation. Please try again.';
        try {
          const errorData = await response.json();
          errMessage = errorData.error || errorData.message || errMessage;
        } catch {
          if (response.status === 429) {
            errMessage = 'Generation limit reached. Please wait a few minutes before trying again.';
          } else if (response.status >= 500) {
            errMessage = 'Our AI service is experiencing high traffic. Please try again shortly.';
          }
        }
        throw new Error(errMessage);
      }

      if (!response.body) {
        throw new Error('Unable to read streaming response from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonText = trimmed.slice(5).trim();
            if (!jsonText) continue;

            try {
              const event = JSON.parse(jsonText);
              if (event.type === 'progress') {
                callbacks.onProgress({
                  stage: event.stage || 1,
                  progress: event.progress || 10,
                  message: event.message || 'Crafting itinerary...',
                });
              } else if (event.type === 'complete') {
                callbacks.onComplete(event.trip);
                return;
              } else if (event.type === 'error') {
                const isTechnical =
                  event.message &&
                  (event.message.includes('GoogleGenerativeAI') ||
                    event.message.includes('API key') ||
                    event.message.includes('JSON') ||
                    event.message.includes('at position'));
                callbacks.onError(
                  isTechnical
                    ? 'We encountered an issue preparing your travel plan. Please try generating again.'
                    : event.message || 'Generation encountered an error. Please try again.'
                );
                return;
              }
            } catch (err) {
              console.warn('Unable to parse streaming chunk:', err);
            }
          }
        }
      }
    } catch (err: any) {
      const isNetwork =
        err.message &&
        (err.message.includes('fetch') ||
          err.message.includes('Network') ||
          err.message.includes('connection'));
      callbacks.onError(
        isNetwork
          ? 'Connection interrupted while generating your itinerary. Please check your internet connection and try again.'
          : err.message || 'Unable to complete itinerary generation. Please try again.'
      );
    }
  }

  async getTrips(params?: { search?: string; status?: string }): Promise<Trip[]> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/itinerary${queryString}`);
  }

  async getTrip(id: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}`);
  }

  async updateTrip(
    id: string,
    updates: { title?: string; status?: string; tripDetails?: any }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTrip(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/itinerary/${id}`, {
      method: 'DELETE',
    });
  }

  async duplicateTrip(id: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async shareTrip(id: string): Promise<{ success: boolean; shareId: string; message: string }> {
    return this.request(`/api/itinerary/${id}/share`, {
      method: 'POST',
    });
  }

  async getSharedTrip(shareId: string): Promise<Trip> {
    return this.request(`/api/itinerary/shared/${shareId}`);
  }

  // Granular itinerary editing endpoints (Milestone 1)
  async updateActivity(
    id: string,
    payload: { day: number; activityIndex: number; activity: ActivityItem }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/activities`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async reorderActivities(
    id: string,
    payload: { day: number; order: number[] }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/activities/reorder`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async moveTripDay(
    id: string,
    payload: { fromIndex: number; toIndex: number }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/days/reorder`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // Version history endpoints (Milestone 1)
  async getTripVersions(id: string): Promise<TripVersionsResponse> {
    return this.request(`/api/itinerary/${id}/versions`);
  }

  async getTripVersion(id: string, version: number): Promise<TripVersionDetails> {
    return this.request(`/api/itinerary/${id}/versions/${version}`);
  }

  async restoreTripVersion(
    id: string,
    version: number,
    note?: string
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/versions/${version}/restore`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  // Feedback & insights endpoints (Milestone 2: AI prompt improvements)
  async submitFeedback(
    id: string,
    payload: { rating: 'up' | 'down'; comment?: string }
  ): Promise<{ success: boolean; feedback: TripFeedback }> {
    return this.request(`/api/itinerary/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getTripInsights(): Promise<TripInsights> {
    return this.request('/api/itinerary/insights');
  }

  // Geo / distance endpoints (Milestone 4: Map & Geo)
  async getRoute(
    points: [number, number][],
    mode: 'walk' | 'bike' | 'drive' = 'drive'
  ): Promise<RouteResult> {
    return this.request('/api/geo/route', {
      method: 'POST',
      body: JSON.stringify({ points, mode }),
    });
  }

  // Expense ledger & travellers (Milestone 5: Budget & Financial)
  async getTripExpenses(id: string): Promise<{
    success: boolean;
    expenses: TripExpense[];
    participants: TripParticipant[];
    finance: TripFinance;
  }> {
    return this.request(`/api/itinerary/${id}/expenses`);
  }

  async addExpense(id: string, payload: ExpenseInput): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateExpense(
    id: string,
    expenseId: string,
    payload: Partial<ExpenseInput>
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses/${expenseId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteExpense(id: string, expenseId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  }

  /** Uploads (or replaces) a receipt image/PDF for an expense (Milestone 5.5). */
  async uploadExpenseReceipt(id: string, expenseId: string, file: File): Promise<Trip> {
    const form = new FormData();
    form.append('receipt', file);
    return this.requestForm(`/api/itinerary/${id}/expenses/${expenseId}/receipt`, form);
  }

  /** Removes an expense's receipt (Milestone 5.5). */
  async deleteExpenseReceipt(id: string, expenseId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/expenses/${expenseId}/receipt`, {
      method: 'DELETE',
    });
  }

  async updateParticipants(
    id: string,
    participants: { name: string; isMe?: boolean }[]
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/participants`, {
      method: 'PUT',
      body: JSON.stringify({ participants }),
    });
  }

  // Currency & rates (Milestone 5: Budget & Financial)
  async updateFinance(
    id: string,
    payload: { baseCurrency?: string; refresh?: boolean }
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/finance`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async getCurrencyRates(base: string, symbols?: string[]): Promise<CurrencyRateSnapshot> {
    const query = new URLSearchParams({ base });
    if (symbols?.length) query.append('symbols', symbols.join(','));
    return this.request(`/api/geo/currency/rates?${query.toString()}`);
  }

  // Weather advisories (Milestone 4: Map & Geo)
  async getWeather(
    lat: number,
    lng: number,
    start: string,
    end: string
  ): Promise<WeatherResponse> {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      start,
      end,
    });
    return this.request(`/api/geo/weather?${query.toString()}`);
  }

  // Nearby search (Milestone 4: Map & Geo)
  async getNearby(
    lat: number,
    lng: number,
    category: NearbyCategory,
    radius?: number
  ): Promise<NearbyResponse> {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      category,
    });
    if (radius) query.append('radius', String(radius));
    return this.request(`/api/geo/nearby?${query.toString()}`);
  }

  /** Asks the AI for a weather-aware replacement for a single day. */
  async suggestIndoorAlternative(id: string, day: number): Promise<DayAlternative> {
    return this.request(`/api/itinerary/${id}/days/${day}/indoor-alternative`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** Weather-aware routing analysis for a trip (Milestone 4.6). */
  async getWeatherRouting(id: string): Promise<WeatherRoutingResponse> {
    return this.request(`/api/itinerary/${id}/weather-routing`);
  }

  // User-drawn custom routes (Milestone 4: Map & Geo)
  async addRoute(id: string, payload: RouteInput): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/routes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateRoute(
    id: string,
    routeId: string,
    payload: Partial<RouteInput>
  ): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/routes/${routeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteRoute(id: string, routeId: string): Promise<Trip> {
    return this.request(`/api/itinerary/${id}/routes/${routeId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
