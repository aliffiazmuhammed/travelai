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

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `Request failed with status ${response.status}`);
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || errorData.error || `Generation failed with status ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error('Streaming response body is not readable');
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
                callbacks.onError(event.message || 'Generation encountered an error');
                return;
              }
            } catch (err) {
              console.warn('Unable to parse streaming chunk:', err);
            }
          }
        }
      }
    } catch (err: any) {
      callbacks.onError(err.message || 'Connection lost during itinerary generation');
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
