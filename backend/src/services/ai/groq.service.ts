import Groq from 'groq-sdk';
import { env } from '../../config/env.js';
import { AIService, GenerateStreamOptions } from './ai.interface.js';
import {
  GenerationAbortedError,
  isAbortError,
  throwIfAborted,
} from './generationGuard.js';

export class GroqService implements AIService {
  private client: Groq;

  private modelName: string;

  constructor() {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY || '' });
    this.modelName = env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const chatCompletion = await this.client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.modelName,
        response_format: { type: 'json_object' },
      });
      return chatCompletion.choices[0]?.message?.content || '';
    } catch (error: any) {
      console.error(`Groq (${this.modelName}) generation error:`, error?.message || error);
      if (this.modelName !== 'qwen/qwen3.8-27b') {
        try {
          console.log('Attempting fallback to qwen/qwen3.8-27b on Groq...');
          const chatCompletion = await this.client.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'qwen/qwen3.8-27b',
            response_format: { type: 'json_object' },
          });
          return chatCompletion.choices[0]?.message?.content || '';
        } catch (fbError) {
          console.error('Groq fallback to qwen/qwen3.8-27b also failed:', fbError);
        }
      }
      throw new Error('Failed to generate content with Groq');
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
      const stream = await this.client.chat.completions.create(
        {
          messages: [{ role: 'user', content: prompt }],
          model: this.modelName,
          response_format: { type: 'json_object' },
          stream: true,
        },
        { signal }
      );

      let fullText = '';
      for await (const chunk of stream) {
        throwIfAborted(signal);
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
      }
      return fullText;
    } catch (error: any) {
      if (isAbortError(error) || signal?.aborted) {
        throw new GenerationAbortedError();
      }
      console.error(`Groq (${this.modelName}) streaming error:`, error?.message || error);
      if (this.modelName !== 'qwen/qwen3.8-27b') {
        try {
          throwIfAborted(signal);
          console.log('Attempting streaming fallback to qwen/qwen3.8-27b on Groq...');
          const stream = await this.client.chat.completions.create(
            {
              messages: [{ role: 'user', content: prompt }],
              model: 'qwen/qwen3.8-27b',
              response_format: { type: 'json_object' },
              stream: true,
            },
            { signal }
          );

          let fullText = '';
          for await (const chunk of stream) {
            throwIfAborted(signal);
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          }
          return fullText;
        } catch (fbError) {
          if (isAbortError(fbError) || signal?.aborted) {
            throw new GenerationAbortedError();
          }
          console.error('Groq streaming fallback to qwen/qwen3.8-27b also failed:', fbError);
        }
      }
      throw new Error('Failed to stream content with Groq');
    }
  }
}
