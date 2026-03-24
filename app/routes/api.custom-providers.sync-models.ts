import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { serializeCustomProvidersCookie } from '~/lib/.server/custom-providers-storage';
import { syncCustomProviderModels, syncCustomProviderModelsDaily } from '~/lib/.server/custom-provider-model-sync';

type SyncActionPayload = {
  providerId?: string;
  includeDisabled?: boolean;
  mode?: 'manual' | 'daily';
  force?: boolean;
};

function parseBoolean(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function buildSyncResponse(result: Awaited<ReturnType<typeof syncCustomProviderModels>>) {
  const headers = new Headers();

  if (result.documentChanged || result.source === 'cookie') {
    headers.set('Set-Cookie', serializeCustomProvidersCookie(result.document));
  }

  return json(result, { headers });
}

async function customProviderSyncLoader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const force = parseBoolean(url.searchParams.get('force'));
  const includeDisabled = parseBoolean(url.searchParams.get('includeDisabled'));

  const result = await syncCustomProviderModelsDaily({
    env: context?.cloudflare?.env,
    cookieHeader: request.headers.get('Cookie'),
    force,
    includeDisabled,
  });

  return buildSyncResponse(result);
}

export const loader = withSecurity(customProviderSyncLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function customProviderSyncAction({ request, context }: ActionFunctionArgs) {
  const payload = (await request.json().catch(() => ({}))) as SyncActionPayload;
  const mode = payload.mode === 'daily' ? 'daily' : 'manual';

  if (mode === 'daily') {
    const result = await syncCustomProviderModelsDaily({
      env: context?.cloudflare?.env,
      cookieHeader: request.headers.get('Cookie'),
      force: payload.force,
      includeDisabled: payload.includeDisabled,
    });

    return buildSyncResponse(result);
  }

  const result = await syncCustomProviderModels({
    env: context?.cloudflare?.env,
    cookieHeader: request.headers.get('Cookie'),
    providerId: payload.providerId,
    includeDisabled: payload.includeDisabled,
  });

  if (payload.providerId && result.reason === 'provider-not-found') {
    return json(result, { status: 404 });
  }

  return buildSyncResponse(result);
}

export const action = withSecurity(customProviderSyncAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
