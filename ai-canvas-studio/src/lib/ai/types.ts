/** `qwen` 与 `openai-compatible` 走同一套协议，只是内置了阿里云百炼的默认地址与模型名。 */
export type AiProvider = 'openai-compatible' | 'mock' | 'qwen';

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
