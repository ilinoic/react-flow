export type AiProvider = 'openai-compatible' | 'mock';

export type AiConfig = {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  imageModel: string;
  textModel: string;
  imageSize: string;
};

export type AiImageReference = { name: string; dataUrl: string };

export type AiGenerateRequest = {
  mode: 'image' | 'text';
  nodeId: string;
  prompt: string;
  references: { texts: string[]; images: AiImageReference[] };
  size?: string;
  config: AiConfig;
};

export type AiGenerateResponse = { imageSrc?: string; text?: string; error?: string };
