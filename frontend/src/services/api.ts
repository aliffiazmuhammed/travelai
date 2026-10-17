import { API_BASE_URL } from '@/config';
import type { Trip, TripInput, User } from '@/types';

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
}

export const api = new ApiClient(API_BASE_URL);
