import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import {
  readCustomProvidersDocument,
  upsertCustomProvider,
  removeCustomProvider,
  replaceCustomProviders,
  persistCustomProvidersDocument,
  serializeCustomProvidersCookie,
} from '~/lib/.server/custom-providers-storage';
import type { CustomProviderDefinition } from '~/types/model';
import { withSecurity } from '~/lib/security';

type CustomProvidersActionPayload = {
  provider?: CustomProviderDefinition;
  providers?: CustomProviderDefinition[];
  id?: string;
};

async function customProvidersLoader({ request, context }: { request: Request; context: any }) {
  const cookieHeader = request.headers.get('Cookie');
  const { document, source } = await readCustomProvidersDocument({
    env: context?.cloudflare?.env,
    cookieHeader,
  });

  return json({
    document,
    source,
  });
}

export const loader = withSecurity(customProvidersLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function customProvidersAction({ request, context }: ActionFunctionArgs) {
  const cookieHeader = request.headers.get('Cookie');
  const method = request.method.toUpperCase();

  const { document: currentDoc } = await readCustomProvidersDocument({
    env: context?.cloudflare?.env,
    cookieHeader,
  });

  let nextDoc = currentDoc;

  if (method === 'POST' || method === 'PUT') {
    const payload = (await request.json()) as CustomProvidersActionPayload;

    if (payload.providers) {
      nextDoc = replaceCustomProviders(currentDoc, payload.providers);
    } else if (payload.provider) {
      nextDoc = upsertCustomProvider(currentDoc, payload.provider);
    } else {
      return json({ error: 'Missing provider payload' }, { status: 400 });
    }
  } else if (method === 'DELETE') {
    let targetId: string | null = new URL(request.url).searchParams.get('id');

    if (!targetId) {
      try {
        const payload = (await request.json()) as CustomProvidersActionPayload;
        targetId = payload.id ?? null;
      } catch {
        // ignore json parse error for empty body
      }
    }

    if (!targetId) {
      return json({ error: 'Missing provider id' }, { status: 400 });
    }

    nextDoc = removeCustomProvider(currentDoc, targetId);
  } else {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { persistedToKV } = await persistCustomProvidersDocument({
    env: context?.cloudflare?.env,
    document: nextDoc,
  });

  return json(
    {
      document: nextDoc,
      persistedToKV,
    },
    {
      headers: {
        'Set-Cookie': serializeCustomProvidersCookie(nextDoc),
      },
    },
  );
}

export const action = withSecurity(customProvidersAction, {
  rateLimit: true,
  allowedMethods: ['POST', 'PUT', 'DELETE'],
});
