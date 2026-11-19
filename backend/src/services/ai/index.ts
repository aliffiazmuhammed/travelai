import { AIService, GenerateStreamOptions } from './ai.interface.js';
import { GeminiService } from './gemini.service.js';
import { GroqService } from './groq.service.js';
import { env } from '../../config/env.js';
import { buildCacheKey, getFromCache, setInCache } from './cache.js';
import {
  GenerationAbortedError,
  isAbortError,
  throwIfAborted,
} from './generationGuard.js';

let primaryService: AIService;
let fallbackService: AIService | null = null;

export type AIProvider = 'gemini' | 'groq' | 'cache';

export interface GenerationResult {
  text: string;
  provider: AIProvider;
  cached: boolean;
}

export function getAIService(): AIService {
  if (!primaryService) {
    primaryService = new GeminiService();
  }
  return primaryService;
}

export function getFallbackAIService(): AIService | null {
  if (!fallbackService && env.GROQ_API_KEY) {
    fallbackService = new GroqService();
  }
  return fallbackService;
}

export async function generateWithFallback(prompt: string): Promise<GenerationResult> {
  const cacheKey = buildCacheKey(prompt);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return { text: cached, provider: 'cache', cached: true };
  }

  try {
    const primary = getAIService();
    const text = await primary.generateContent(prompt);
    setInCache(cacheKey, text);
    return { text, provider: 'gemini', cached: false };
  } catch (error) {
    console.warn('Primary AI service failed, trying fallback...', error);
    const fallback = getFallbackAIService();
    if (fallback) {
      const text = await fallback.generateContent(prompt);
      setInCache(cacheKey, text);
      return { text, provider: 'groq', cached: false };
    }
    throw error;
  }
}

export async function generateStreamWithFallback(
  prompt: string,
  onChunk: (chunk: string) => void,
  options: GenerateStreamOptions = {}
): Promise<GenerationResult> {
  const { signal } = options;
  throwIfAborted(signal);

  const cacheKey = buildCacheKey(prompt);
  const cached = getFromCache(cacheKey);
  if (cached) {
    // Replay the cached result through the same streaming callback contract.
    // A cancel between lookup and replay must still produce nothing.
    throwIfAborted(signal);
    onChunk(cached);
    return { text: cached, provider: 'cache', cached: true };
  }

  try {
    const primary = getAIService();
    const text = await primary.generateContentStream(prompt, onChunk, { signal });
    // Never cache or fall back after a cancel: the user asked us to stop.
    throwIfAborted(signal);
    setInCache(cacheKey, text);
    return { text, provider: 'gemini', cached: false };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw new GenerationAbortedError();
    }
    console.warn('Primary AI streaming failed, trying fallback...', error);
    const fallback = getFallbackAIService();
    if (fallback) {
      throwIfAborted(signal);
      const text = await fallback.generateContentStream(prompt, onChunk, { signal });
      throwIfAborted(signal);
      setInCache(cacheKey, text);
      return { text, provider: 'groq', cached: false };
    }
    throw error;
  }
}
