import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';
import { AIService, GenerateStreamOptions } from './ai.interface.js';
import {
  GenerationAbortedError,
  isAbortError,
  throwIfAborted,
} from './generationGuard.js';

export class GeminiService implements AIService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    this.modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  private getModel(name: string = this.modelName) {
    return this.genAI.getGenerativeModel({
      model: name,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const model = this.getModel();
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error(`Gemini (${this.modelName}) generation error:`, error?.message || error);
      if (this.modelName !== 'gemini-2.5-flash') {
        try {
          console.log('Attempting fallback to gemini-2.5-flash...');
          const fallbackModel = this.getModel('gemini-2.5-flash');
          const result = await fallbackModel.generateContent(prompt);
          const response = await result.response;
          return response.text();
        } catch (fbError) {
          console.error('Gemini fallback to gemini-2.5-flash also failed:', fbError);
        }
      }
      throw new Error('Failed to generate content with Gemini');
    }
  }

  async generateContentStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options: GenerateStreamOptions = {}
  ): Promise<string> {
    const { signal } = options;
    throwIfAborted(signal);

    try {
      const model = this.getModel();
      // `signal` is a client-side abort: it stops delivery immediately, but the
      // provider may still finish (and bill) the request it already accepted.
      const result = await model.generateContentStream(prompt, { signal });
      // The SDK returns an aggregate promise we never await; without a handler its
      // rejection on a broken stream becomes an unhandled rejection that kills Node.
      result.response.catch(() => undefined);
      let fullText = '';
      for await (const chunk of result.stream) {
        throwIfAborted(signal);
        const text = chunk.text();
        fullText += text;
        onChunk(text);
      }
      return fullText;
    } catch (error: any) {
      if (isAbortError(error) || signal?.aborted) {
        throw new GenerationAbortedError();
      }
      console.error(`Gemini (${this.modelName}) streaming error:`, error?.message || error);
      if (this.modelName !== 'gemini-2.5-flash') {
        try {
          throwIfAborted(signal);
          console.log('Attempting streaming fallback to gemini-2.5-flash...');
          const fallbackModel = this.getModel('gemini-2.5-flash');
          const result = await fallbackModel.generateContentStream(prompt, { signal });
          result.response.catch(() => undefined);
          let fullText = '';
          for await (const chunk of result.stream) {
            throwIfAborted(signal);
            const text = chunk.text();
            fullText += text;
            onChunk(text);
          }
          return fullText;
        } catch (fbError) {
          if (isAbortError(fbError) || signal?.aborted) {
            throw new GenerationAbortedError();
          }
          console.error('Gemini streaming fallback to gemini-2.5-flash also failed:', fbError);
        }
      }
      throw new Error('Failed to stream content with Gemini');
    }
  }
}
