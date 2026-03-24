import type { ModelInfo } from '~/lib/modules/llm/types';
import type { CustomProviderDefinition, CustomProvidersDocument, ProviderInfo } from '~/types/model';

const DEFAULT_CUSTOM_MODEL_CONTEXT_WINDOW = 128000;

const CUSTOM_PROVIDER_ICON_MAP: Record<CustomProviderDefinition['type'], string> = {
  'openai-compatible': 'i-ph:plug',
  ollama: 'i-ph:cpu',
  lmstudio: 'i-ph:desktop',
  vllm: 'i-ph:rocket',
  'openrouter-gateway': 'i-ph:shuffle',
};

function normalizeModelList(modelList?: string[]): string[] {
  if (!Array.isArray(modelList)) {
    return [];
  }

  const unique = new Set<string>();

  for (const modelName of modelList) {
    if (typeof modelName !== 'string') {
      continue;
    }

    const normalized = modelName.trim();

    if (!normalized) {
      continue;
    }

    unique.add(normalized);
  }

  return Array.from(unique);
}

export function customProviderToModelInfoList(provider: CustomProviderDefinition): ModelInfo[] {
  return normalizeModelList(provider.modelList).map((modelName) => ({
    name: modelName,
    label: modelName,
    provider: provider.name,
    maxTokenAllowed: DEFAULT_CUSTOM_MODEL_CONTEXT_WINDOW,
  }));
}

export function customProviderToProviderInfo(provider: CustomProviderDefinition): ProviderInfo {
  return {
    name: provider.name,
    staticModels: customProviderToModelInfoList(provider),
    icon: CUSTOM_PROVIDER_ICON_MAP[provider.type],
  };
}

export function getEnabledCustomProviders(document: CustomProvidersDocument | null | undefined): CustomProviderDefinition[] {
  if (!document || !Array.isArray(document.providers)) {
    return [];
  }

  return document.providers.filter((provider) => provider.enabled);
}

export function parseCustomProvidersCookieValue(rawValue?: string): CustomProviderDefinition[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<CustomProvidersDocument> | null;

    if (!parsed || !Array.isArray(parsed.providers)) {
      return [];
    }

    return parsed.providers.filter((provider): provider is CustomProviderDefinition => {
      return Boolean(
        provider &&
          typeof provider.id === 'string' &&
          typeof provider.name === 'string' &&
          typeof provider.type === 'string' &&
          typeof provider.baseUrl === 'string' &&
          typeof provider.enabled === 'boolean',
      );
    });
  } catch {
    return [];
  }
}
