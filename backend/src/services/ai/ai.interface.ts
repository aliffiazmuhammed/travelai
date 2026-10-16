export interface AIService {
  generateContent(prompt: string): Promise<string>;
  generateContentStream(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
}
