import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import type { CustomProviderDefinition } from '~/types/model';
import { withSecurity } from '~/lib/security';
import { readCustomProvidersDocument } from '~/lib/.server/custom-providers-storage';
import { checkCustomProviderHealth } from '~/lib/.server/custom-provider-health';

type HealthActionPayload = {
  id?: string;
  provider?: CustomProviderDefinition;
};

function isValidProviderPayload(input: unknown): input is CustomProviderDefinition {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const provider = input as Partial<CustomProviderDefinition>;

  return Boolean(provider.id && provider.name && provider.type && provider.baseUrl);
}

async function getProviderById(args: {
  request: Request;
  context: any;
  id: string;
}): Promise<{ provider: CustomProviderDefinition | null; source: string }> {
  const { request, context, id } = args;
  const cookieHeader = request.headers.get('Cookie');
  const { document, source } = await readCustomProvidersDocument({
    env: context?.cloudflare?.env,
    cookieHeader,
  });

  const provider = document.providers.find((item) => item.id === id) || null;

  return {
    provider,
    source,
  };
}

async function customProviderHealthLoader({ request, context }: LoaderFunctionArgs) {
  const id = new URL(request.url).searchParams.get('id');

  if (!id) {
    return json({ error: 'Missing provider id' }, { status: 400 });
  }

  const { provider, source } = await getProviderById({ request, context, id });

  if (!provider) {
    return json({ error: 'Provider not found' }, { status: 404 });
  }

  const result = await checkCustomProviderHealth(provider);

  return json({
    result,
    source,
  });
}

export const loader = withSecurity(customProviderHealthLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function customProviderHealthAction({ request, context }: ActionFunctionArgs) {
  const payload = (await request.json().catch(() => ({}))) as HealthActionPayload;

  if (payload.id) {
    const { provider, source } = await getProviderById({ request, context, id: payload.id });

    if (!provider) {
      return json({ error: 'Provider not found' }, { status: 404 });
    }

    const result = await checkCustomProviderHealth(provider);

    return json({
      result,
      source,
    });
  }

  if (isValidProviderPayload(payload.provider)) {
    const result = await checkCustomProviderHealth(payload.provider);

    return json({
      result,
      source: 'request',
    });
  }

  return json({ error: 'Missing provider id or provider payload' }, { status: 400 });
}

export const action = withSecurity(customProviderHealthAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
