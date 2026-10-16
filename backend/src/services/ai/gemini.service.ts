import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';
import { AIService } from './ai.interface.js';

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

  async generateContentStream(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
    try {
      const model = this.getModel();
      const result = await model.generateContentStream(prompt);
      let fullText = '';
      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullText += text;
        onChunk(text);
      }
      return fullText;
    } catch (error: any) {
      console.error(`Gemini (${this.modelName}) streaming error:`, error?.message || error);
      if (this.modelName !== 'gemini-2.5-flash') {
        try {
          console.log('Attempting streaming fallback to gemini-2.5-flash...');
          const fallbackModel = this.getModel('gemini-2.5-flash');
          const result = await fallbackModel.generateContentStream(prompt);
          let fullText = '';
          for await (const chunk of result.stream) {
            const text = chunk.text();
            fullText += text;
            onChunk(text);
          }
          return fullText;
        } catch (fbError) {
          console.error('Gemini streaming fallback to gemini-2.5-flash also failed:', fbError);
        }
      }
      throw new Error('Failed to stream content with Gemini');
    }
  }
}
