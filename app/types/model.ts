import type { ModelInfo } from '~/lib/modules/llm/types';

export type ProviderInfo = {
  staticModels: ModelInfo[];
  name: string;
  getDynamicModels?: (
    providerName: string,
    apiKeys?: Record<string, string>,
    providerSettings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ) => Promise<ModelInfo[]>;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;
};

export interface IProviderSetting {
  enabled?: boolean;
  baseUrl?: string;
  OPENAI_LIKE_API_MODELS?: string;
}

export type IProviderConfig = ProviderInfo & {
  settings: IProviderSetting;
};

export type CustomProviderType = 'openai-compatible' | 'ollama' | 'lmstudio' | 'vllm' | 'openrouter-gateway';

export interface CustomProviderDefinition {
  id: string;
  name: string;
  type: CustomProviderType;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
  modelList?: string[];
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomProvidersDocument {
  version: 1;
  updatedAt: string;
  providers: CustomProviderDefinition[];
}
