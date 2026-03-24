import type { CustomProvidersDocument } from '~/types/model';

export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      // Decode the name and value, and join value parts in case it contains '='
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

function parseJSONCookie<T>(rawValue?: string): T | null {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);
  return parseJSONCookie<Record<string, string>>(cookies.apiKeys) || {};
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);
  return parseJSONCookie<Record<string, any>>(cookies.providers) || {};
}

export function getCustomProvidersFromCookie(cookieHeader: string | null): CustomProvidersDocument | null {
  const cookies = parseCookies(cookieHeader);
  return parseJSONCookie<CustomProvidersDocument>(cookies.customProviders);
}
