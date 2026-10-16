import { AIService } from './ai.interface.js';
import { GeminiService } from './gemini.service.js';
import { GroqService } from './groq.service.js';
import { env } from '../../config/env.js';

let primaryService: AIService;
let fallbackService: AIService | null = null;

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

export async function generateWithFallback(prompt: string): Promise<string> {
  try {
    const primary = getAIService();
    return await primary.generateContent(prompt);
  } catch (error) {
    console.warn('Primary AI service failed, trying fallback...', error);
    const fallback = getFallbackAIService();
    if (fallback) {
      return await fallback.generateContent(prompt);
    }
    throw error;
  }
}

export async function generateStreamWithFallback(
  prompt: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  try {
    const primary = getAIService();
    return await primary.generateContentStream(prompt, onChunk);
  } catch (error) {
    console.warn('Primary AI streaming failed, trying fallback...', error);
    const fallback = getFallbackAIService();
    if (fallback) {
      return await fallback.generateContentStream(prompt, onChunk);
    }
    throw error;
  }
}
