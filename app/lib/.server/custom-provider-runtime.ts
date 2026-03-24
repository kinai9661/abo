import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModelV1 } from 'ai';
import type { CustomProviderDefinition, CustomProvidersDocument } from '~/types/model';

function toEnvRecord(env?: Env | Record<string, string>): Record<string, string> {
  if (!env) {
    return {};
  }

  return Object.entries(env).reduce(
    (acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    },
    {} as Record<string, string>,
  );
}

function normalizeBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl.trim());

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol for custom provider');
  }

  parsed.hash = '';

  return parsed.toString().replace(/\/+$/, '');
}

function ensurePathSuffix(baseUrl: string, suffix: '/v1' | '/api'): string {
  const parsed = new URL(baseUrl);
  const path = parsed.pathname.replace(/\/+$/, '');

  if (path === suffix || path.endsWith(suffix)) {
    return parsed.toString().replace(/\/+$/, '');
  }

  parsed.pathname = `${path || ''}${suffix}`;

  return parsed.toString().replace(/\/+$/, '');
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(headers).some((headerKey) => headerKey.toLowerCase() === target);
}

function buildOpenAIHeaders(provider: CustomProviderDefinition): Record<string, string> {
  const headers = {
    ...(provider.headers || {}),
  };

  if (provider.apiKey && !hasHeader(headers, 'authorization')) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

function getDefaultNumCtx(env?: Env | Record<string, string>): number {
  const envRecord = toEnvRecord(env);
  const raw = envRecord.DEFAULT_NUM_CTX;
  const parsed = raw ? parseInt(raw, 10) : NaN;

  return Number.isFinite(parsed) ? parsed : 32768;
}

export function getEnabledCustomProviderByName(
  document: CustomProvidersDocument | null | undefined,
  providerName: string,
): CustomProviderDefinition | undefined {
  if (!document || !Array.isArray(document.providers)) {
    return undefined;
  }

  return document.providers.find((provider) => provider.enabled && provider.name === providerName);
}

export function getCustomProviderModelInstance(
  provider: CustomProviderDefinition,
  model: string,
  env?: Env | Record<string, string>,
): LanguageModelV1 {
  const normalizedBaseUrl = normalizeBaseUrl(provider.baseUrl);

  switch (provider.type) {
    case 'ollama': {
      const ollamaProvider = createOllama({
        baseURL: ensurePathSuffix(normalizedBaseUrl, '/api'),
      });

      return ollamaProvider(model, {
        numCtx: getDefaultNumCtx(env),
      });
    }

    case 'lmstudio': {
      const lmstudio = createOpenAI({
        baseURL: ensurePathSuffix(normalizedBaseUrl, '/v1'),
        apiKey: provider.apiKey || '',
        headers: buildOpenAIHeaders(provider),
      });

      return lmstudio(model);
    }

    case 'openai-compatible':
    case 'vllm':
    case 'openrouter-gateway': {
      const openai = createOpenAI({
        baseURL: ensurePathSuffix(normalizedBaseUrl, '/v1'),
        apiKey: provider.apiKey || '',
        headers: buildOpenAIHeaders(provider),
      });

      return openai(model);
    }

    default:
      throw new Error(`Unsupported custom provider type: ${provider.type}`);
  }
}
