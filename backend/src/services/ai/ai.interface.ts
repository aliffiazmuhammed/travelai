export interface GenerateStreamOptions {
  /** Aborts the provider request when the traveller stops generation (C-03). */
  signal?: AbortSignal;
}

export interface AIService {
  generateContent(prompt: string): Promise<string>;
  generateContentStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: GenerateStreamOptions
  ): Promise<string>;
}
