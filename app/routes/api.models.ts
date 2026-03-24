import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { readCustomProvidersDocument } from '~/lib/.server/custom-providers-storage';
import {
  customProviderToModelInfoList,
  customProviderToProviderInfo,
  getEnabledCustomProviders,
} from '~/lib/custom-providers';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager.getAllProviders().map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export async function loader({
  request,
  params,
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  const { providers: builtInProviders, defaultProvider } = getProviderInfo(llmManager);
  const { document: customProvidersDoc } = await readCustomProvidersDocument({
    env: context.cloudflare?.env,
    cookieHeader,
  });
  const enabledCustomProviders = getEnabledCustomProviders(customProvidersDoc);
  const customProviders = enabledCustomProviders
    .filter((provider) => !builtInProviders.some((builtInProvider) => builtInProvider.name === provider.name))
    .map((provider) => customProviderToProviderInfo(provider));

  let modelList: ModelInfo[] = [];

  if (params.provider) {
    // Only update models for the specific provider
    const provider = llmManager.getProvider(params.provider);

    if (provider) {
      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
      });
    } else {
      const customProvider = enabledCustomProviders.find((entry) => entry.name === params.provider);
      modelList = customProvider ? customProviderToModelInfoList(customProvider) : [];
    }
  } else {
    // Update all models
    const builtInModelList = await llmManager.updateModelList({
      apiKeys,
      providerSettings,
      serverEnv: context.cloudflare?.env,
    });

    const customModelList = enabledCustomProviders
      .filter((provider) => !builtInProviders.some((builtInProvider) => builtInProvider.name === provider.name))
      .flatMap((provider) => customProviderToModelInfoList(provider));

    modelList = [...builtInModelList, ...customModelList];
  }

  return json<ModelsResponse>({
    modelList,
    providers: [...builtInProviders, ...customProviders],
    defaultProvider,
  });
}
