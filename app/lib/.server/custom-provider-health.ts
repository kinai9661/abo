import type { CustomProviderDefinition, CustomProviderType } from '~/types/model';

const HEALTH_CHECK_TIMEOUT_MS = 10000;

type ProviderHealthCheckDetails = {
  isHealthy: boolean;
  endpoint: string;
  models: string[];
  version?: string;
  error?: string;
  httpStatus?: number;
};

export interface CustomProviderHealthCheckResult {
  providerId: string;
  providerType: CustomProviderType;
  status: 'healthy' | 'unhealthy';
  checkedAt: string;
  latencyMs: number;
  endpoint: string;
  models: string[];
  version?: string;
  error?: string;
  httpStatus?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl.trim());

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol');
  }

  parsed.hash = '';

  return parsed.toString().replace(/\/+$/, '');
}

function ensureV1Path(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  const path = parsed.pathname.replace(/\/+$/, '');

  if (path === '/v1' || path.endsWith('/v1')) {
    return parsed.toString().replace(/\/+$/, '');
  }

  parsed.pathname = `${path || ''}/v1`;

  return parsed.toString().replace(/\/+$/, '');
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  const target = key.toLowerCase();
  return Object.keys(headers).some((headerKey) => headerKey.toLowerCase() === target);
}

function buildRequestHeaders(provider: CustomProviderDefinition): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(provider.headers || {}),
  };

  if (provider.apiKey && !hasHeader(headers, 'authorization')) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

async function requestJson(
  url: string,
  headers: Record<string, string>,
): Promise<{
  response: Response;
  data: any;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    return { response, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkOpenAICompatibleProvider(
  provider: CustomProviderDefinition,
  baseUrl: string,
): Promise<ProviderHealthCheckDetails> {
  const v1BaseUrl = ensureV1Path(baseUrl);
  const endpoint = `${v1BaseUrl}/models`;
  const headers = buildRequestHeaders(provider);
  const { response, data } = await requestJson(endpoint, headers);

  if (!response.ok) {
    return {
      isHealthy: false,
      endpoint,
      models: [],
      error: `HTTP ${response.status}: ${response.statusText}`,
      httpStatus: response.status,
    };
  }

  const models = Array.isArray(data?.data)
    ? data.data
        .map((item: any) => (typeof item?.id === 'string' ? item.id : null))
        .filter((item: string | null): item is string => Boolean(item))
    : [];

  return {
    isHealthy: true,
    endpoint,
    models,
  };
}

async function checkOllamaProvider(
  provider: CustomProviderDefinition,
  baseUrl: string,
): Promise<ProviderHealthCheckDetails> {
  const endpoint = `${baseUrl}/api/tags`;
  const headers = buildRequestHeaders(provider);
  const { response, data } = await requestJson(endpoint, headers);

  if (!response.ok) {
    return {
      isHealthy: false,
      endpoint,
      models: [],
      error: `HTTP ${response.status}: ${response.statusText}`,
      httpStatus: response.status,
    };
  }

  const models = Array.isArray(data?.models)
    ? data.models
        .map((item: any) => (typeof item?.name === 'string' ? item.name : null))
        .filter((item: string | null): item is string => Boolean(item))
    : [];

  let version: string | undefined;

  try {
    const versionResponse = await fetch(`${baseUrl}/api/version`, {
      method: 'GET',
      headers,
    });

    if (versionResponse.ok) {
      const versionData = (await versionResponse.json().catch(() => null)) as { version?: string } | null;
      version = typeof versionData?.version === 'string' ? versionData.version : undefined;
    }
  } catch {
    // ignore version endpoint errors
  }

  return {
    isHealthy: true,
    endpoint,
    models,
    version,
  };
}

async function checkProviderHealth(
  provider: CustomProviderDefinition,
  baseUrl: string,
): Promise<ProviderHealthCheckDetails> {
  if (provider.type === 'ollama') {
    return checkOllamaProvider(provider, baseUrl);
  }

  return checkOpenAICompatibleProvider(provider, baseUrl);
}

export async function checkCustomProviderHealth(
  provider: CustomProviderDefinition,
): Promise<CustomProviderHealthCheckResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const baseUrl = normalizeBaseUrl(provider.baseUrl);
    const details = await checkProviderHealth(provider, baseUrl);

    return {
      providerId: provider.id,
      providerType: provider.type,
      status: details.isHealthy ? 'healthy' : 'unhealthy',
      checkedAt,
      latencyMs: Date.now() - startedAt,
      endpoint: details.endpoint,
      models: details.models,
      version: details.version,
      error: details.error,
      httpStatus: details.httpStatus,
    };
  } catch (error) {
    return {
      providerId: provider.id,
      providerType: provider.type,
      status: 'unhealthy',
      checkedAt,
      latencyMs: Date.now() - startedAt,
      endpoint: provider.baseUrl,
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
