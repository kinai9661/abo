import type { CustomProviderDefinition, CustomProvidersDocument } from '~/types/model';
import { getCustomProvidersFromCookie } from '~/lib/api/cookies';

export const CUSTOM_PROVIDERS_KV_KEY = 'custom_providers:v1';
export const CUSTOM_PROVIDERS_COOKIE_KEY = 'customProviders';

export type CustomProviderSource = 'kv' | 'cookie' | 'default';

type EnvLike = {
  CUSTOM_PROVIDERS_KV?: KVNamespace;
};

interface ReadCustomProvidersOptions {
  env?: EnvLike;
  cookieHeader: string | null;
}

interface PersistCustomProvidersOptions {
  env?: EnvLike;
  document: CustomProvidersDocument;
}

export function createEmptyCustomProvidersDocument(): CustomProvidersDocument {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    providers: [],
  };
}

function normalizeProvider(provider: Partial<CustomProviderDefinition>): CustomProviderDefinition | null {
  if (!provider.id || !provider.name || !provider.type || !provider.baseUrl) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled ?? true,
    apiKey: provider.apiKey,
    modelList: Array.isArray(provider.modelList)
      ? provider.modelList.filter((m): m is string => typeof m === 'string')
      : [],
    headers:
      provider.headers && typeof provider.headers === 'object'
        ? Object.fromEntries(
            Object.entries(provider.headers).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'),
          )
        : {},
    createdAt: provider.createdAt || now,
    updatedAt: provider.updatedAt || now,
  };
}

export function normalizeCustomProvidersDocument(input: unknown): CustomProvidersDocument {
  if (!input || typeof input !== 'object') {
    return createEmptyCustomProvidersDocument();
  }

  const parsed = input as Partial<CustomProvidersDocument>;
  const providersInput = Array.isArray(parsed.providers) ? parsed.providers : [];
  const providers = providersInput
    .map((provider) => normalizeProvider(provider))
    .filter((provider): provider is CustomProviderDefinition => Boolean(provider));

  return {
    version: 1,
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    providers,
  };
}

export async function readCustomProvidersDocument({ env, cookieHeader }: ReadCustomProvidersOptions): Promise<{
  document: CustomProvidersDocument;
  source: CustomProviderSource;
}> {
  const kv = env?.CUSTOM_PROVIDERS_KV;

  if (kv) {
    try {
      const raw = await kv.get(CUSTOM_PROVIDERS_KV_KEY);

      if (raw) {
        return {
          document: normalizeCustomProvidersDocument(JSON.parse(raw)),
          source: 'kv',
        };
      }
    } catch (error) {
      console.error('Failed reading custom providers from KV:', error);
    }
  }

  const cookieDoc = getCustomProvidersFromCookie(cookieHeader);

  if (cookieDoc) {
    return {
      document: normalizeCustomProvidersDocument(cookieDoc),
      source: 'cookie',
    };
  }

  return {
    document: createEmptyCustomProvidersDocument(),
    source: 'default',
  };
}

export async function persistCustomProvidersDocument({
  env,
  document,
}: PersistCustomProvidersOptions): Promise<{ persistedToKV: boolean }> {
  const kv = env?.CUSTOM_PROVIDERS_KV;

  if (!kv) {
    return { persistedToKV: false };
  }

  try {
    await kv.put(CUSTOM_PROVIDERS_KV_KEY, JSON.stringify(document));
    return { persistedToKV: true };
  } catch (error) {
    console.error('Failed writing custom providers to KV:', error);
    return { persistedToKV: false };
  }
}

export function upsertCustomProvider(
  document: CustomProvidersDocument,
  provider: CustomProviderDefinition,
): CustomProvidersDocument {
  const normalized = normalizeProvider(provider);

  if (!normalized) {
    throw new Error('Invalid custom provider payload');
  }

  const now = new Date().toISOString();
  const existing = document.providers.find((p) => p.id === normalized.id);

  const nextProvider: CustomProviderDefinition = {
    ...normalized,
    createdAt: existing?.createdAt || normalized.createdAt || now,
    updatedAt: now,
  };

  const nextProviders = existing
    ? document.providers.map((p) => (p.id === nextProvider.id ? nextProvider : p))
    : [...document.providers, nextProvider];

  return {
    ...document,
    updatedAt: now,
    providers: nextProviders,
  };
}

export function removeCustomProvider(document: CustomProvidersDocument, id: string): CustomProvidersDocument {
  const now = new Date().toISOString();

  return {
    ...document,
    updatedAt: now,
    providers: document.providers.filter((provider) => provider.id !== id),
  };
}

export function replaceCustomProviders(
  document: CustomProvidersDocument,
  providers: CustomProviderDefinition[],
): CustomProvidersDocument {
  const now = new Date().toISOString();

  const nextProviders = providers
    .map((provider) => normalizeProvider(provider))
    .filter((provider): provider is CustomProviderDefinition => Boolean(provider))
    .map((provider) => ({ ...provider, updatedAt: now, createdAt: provider.createdAt || now }));

  return {
    ...document,
    updatedAt: now,
    providers: nextProviders,
  };
}

export function serializeCustomProvidersCookie(document: CustomProvidersDocument): string {
  const value = encodeURIComponent(JSON.stringify(document));

  return `${CUSTOM_PROVIDERS_COOKIE_KEY}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
