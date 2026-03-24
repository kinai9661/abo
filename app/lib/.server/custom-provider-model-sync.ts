import type { CustomProviderDefinition, CustomProvidersDocument } from '~/types/model';
import {
  type CustomProviderSource,
  persistCustomProvidersDocument,
  readCustomProvidersDocument,
} from '~/lib/.server/custom-providers-storage';
import { checkCustomProviderHealth } from '~/lib/.server/custom-provider-health';

const DAILY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CUSTOM_PROVIDERS_SYNC_META_KV_KEY = 'custom_providers:model_sync_meta:v1';

type EnvLike = {
  CUSTOM_PROVIDERS_KV?: KVNamespace;
};

type SyncMode = 'manual' | 'daily';

interface SyncMetadata {
  lastFullSyncAt?: string;
  lastRunAt?: string;
}

export interface ProviderModelSyncEntry {
  providerId: string;
  providerName: string;
  providerType: CustomProviderDefinition['type'];
  status: 'synced' | 'failed' | 'skipped';
  checkedAt: string;
  latencyMs: number;
  modelCountBefore: number;
  modelCountAfter: number;
  endpoint: string;
  error?: string;
}

export interface CustomProvidersModelSyncResult {
  mode: SyncMode;
  triggeredAt: string;
  ran: boolean;
  source: CustomProviderSource;
  persistedToKV: boolean;
  metadataPersisted: boolean;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  reason?: string;
  entries: ProviderModelSyncEntry[];
  document: CustomProvidersDocument;
  metadata: SyncMetadata;
  documentChanged: boolean;
}

interface BaseSyncOptions {
  env?: EnvLike;
  cookieHeader: string | null;
  force?: boolean;
  includeDisabled?: boolean;
}

interface ManualSyncOptions extends BaseSyncOptions {
  providerId?: string;
}

function isAfterInterval(lastTimestamp?: string, intervalMs = DAILY_SYNC_INTERVAL_MS): boolean {
  if (!lastTimestamp) {
    return true;
  }

  const parsedTime = Date.parse(lastTimestamp);

  if (Number.isNaN(parsedTime)) {
    return true;
  }

  return Date.now() - parsedTime >= intervalMs;
}

function mergeProviderModels(
  provider: CustomProviderDefinition,
  models: string[],
  syncedAt: string,
): CustomProviderDefinition {
  return {
    ...provider,
    modelList: models,
    updatedAt: syncedAt,
  };
}

async function readSyncMetadata(env?: EnvLike): Promise<SyncMetadata> {
  const kv = env?.CUSTOM_PROVIDERS_KV;

  if (!kv) {
    return {};
  }

  try {
    const raw = await kv.get(CUSTOM_PROVIDERS_SYNC_META_KV_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as SyncMetadata;

    return {
      lastFullSyncAt: typeof parsed.lastFullSyncAt === 'string' ? parsed.lastFullSyncAt : undefined,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : undefined,
    };
  } catch (error) {
    console.error('Failed reading custom provider sync metadata from KV:', error);
    return {};
  }
}

async function writeSyncMetadata(env: EnvLike | undefined, metadata: SyncMetadata): Promise<boolean> {
  const kv = env?.CUSTOM_PROVIDERS_KV;

  if (!kv) {
    return false;
  }

  try {
    await kv.put(CUSTOM_PROVIDERS_SYNC_META_KV_KEY, JSON.stringify(metadata));
    return true;
  } catch (error) {
    console.error('Failed writing custom provider sync metadata to KV:', error);
    return false;
  }
}

function createNoopResult(args: {
  mode: SyncMode;
  triggeredAt: string;
  source: CustomProviderSource;
  reason: string;
  document: CustomProvidersDocument;
  metadata: SyncMetadata;
}): CustomProvidersModelSyncResult {
  const { mode, triggeredAt, source, reason, document, metadata } = args;

  return {
    mode,
    triggeredAt,
    ran: false,
    source,
    persistedToKV: false,
    metadataPersisted: false,
    syncedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    reason,
    entries: [],
    document,
    metadata,
    documentChanged: false,
  };
}

async function runManualSync(options: {
  mode: SyncMode;
  env?: EnvLike;
  document: CustomProvidersDocument;
  source: CustomProviderSource;
  providerId?: string;
  includeDisabled: boolean;
  metadata: SyncMetadata;
}): Promise<CustomProvidersModelSyncResult> {
  const { mode, env, document, source, providerId, includeDisabled, metadata } = options;
  const triggeredAt = new Date().toISOString();

  const selectedProviders = document.providers
    .filter((provider) => (providerId ? provider.id === providerId : true))
    .filter((provider) => (includeDisabled ? true : provider.enabled));

  if (providerId && selectedProviders.length === 0) {
    return createNoopResult({
      mode,
      triggeredAt,
      source,
      reason: 'provider-not-found',
      document,
      metadata,
    });
  }

  if (selectedProviders.length === 0) {
    return createNoopResult({
      mode,
      triggeredAt,
      source,
      reason: 'no-providers-selected',
      document,
      metadata,
    });
  }

  const entries: ProviderModelSyncEntry[] = [];
  const providerUpdates = new Map<string, CustomProviderDefinition>();

  for (const provider of selectedProviders) {
    const startTime = Date.now();
    const checkedAt = new Date().toISOString();
    const modelCountBefore = Array.isArray(provider.modelList) ? provider.modelList.length : 0;

    try {
      const healthResult = await checkCustomProviderHealth(provider);
      const latencyMs = Date.now() - startTime;

      if (healthResult.status === 'healthy') {
        providerUpdates.set(provider.id, mergeProviderModels(provider, healthResult.models, checkedAt));

        entries.push({
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          status: 'synced',
          checkedAt,
          latencyMs,
          modelCountBefore,
          modelCountAfter: healthResult.models.length,
          endpoint: healthResult.endpoint,
          error: healthResult.error,
        });
      } else {
        entries.push({
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          status: 'failed',
          checkedAt,
          latencyMs,
          modelCountBefore,
          modelCountAfter: modelCountBefore,
          endpoint: healthResult.endpoint,
          error: healthResult.error,
        });
      }
    } catch (error) {
      entries.push({
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        status: 'failed',
        checkedAt,
        latencyMs: Date.now() - startTime,
        modelCountBefore,
        modelCountAfter: modelCountBefore,
        endpoint: provider.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  let nextDocument = document;
  const documentChanged = providerUpdates.size > 0;

  if (documentChanged) {
    const updatedProviders = document.providers.map((provider) => providerUpdates.get(provider.id) || provider);

    nextDocument = {
      ...document,
      updatedAt: triggeredAt,
      providers: updatedProviders,
    };
  }

  const persisted = documentChanged
    ? await persistCustomProvidersDocument({
        env,
        document: nextDocument,
      })
    : { persistedToKV: false };

  const syncedCount = entries.filter((entry) => entry.status === 'synced').length;
  const failedCount = entries.filter((entry) => entry.status === 'failed').length;
  const skippedCount = entries.filter((entry) => entry.status === 'skipped').length;

  return {
    mode,
    triggeredAt,
    ran: true,
    source,
    persistedToKV: persisted.persistedToKV,
    metadataPersisted: false,
    syncedCount,
    failedCount,
    skippedCount,
    entries,
    document: nextDocument,
    metadata,
    documentChanged,
  };
}

export async function syncCustomProviderModels(options: ManualSyncOptions): Promise<CustomProvidersModelSyncResult> {
  const { env, cookieHeader, providerId, includeDisabled = false } = options;
  const { document, source } = await readCustomProvidersDocument({ env, cookieHeader });
  const metadata = await readSyncMetadata(env);

  return runManualSync({
    mode: 'manual',
    env,
    document,
    source,
    providerId,
    includeDisabled,
    metadata,
  });
}

export async function syncCustomProviderModelsDaily(options: BaseSyncOptions): Promise<CustomProvidersModelSyncResult> {
  const { env, cookieHeader, force = false, includeDisabled = false } = options;
  const { document, source } = await readCustomProvidersDocument({ env, cookieHeader });
  const metadata = await readSyncMetadata(env);
  const triggeredAt = new Date().toISOString();

  if (!force && !isAfterInterval(metadata.lastFullSyncAt)) {
    return createNoopResult({
      mode: 'daily',
      triggeredAt,
      source,
      reason: 'daily-sync-not-due',
      document,
      metadata,
    });
  }

  const syncResult = await runManualSync({
    mode: 'daily',
    env,
    document,
    source,
    includeDisabled,
    metadata,
  });

  const nextMetadata: SyncMetadata = {
    ...metadata,
    lastRunAt: triggeredAt,
    lastFullSyncAt: syncResult.ran ? triggeredAt : metadata.lastFullSyncAt,
  };

  const metadataPersisted = await writeSyncMetadata(env, nextMetadata);

  return {
    ...syncResult,
    metadata: nextMetadata,
    metadataPersisted,
  };
}
