// Cloudflare-compatible load context shim for Node.js / Vercel environments
// This provides context.cloudflare.env pointing to process.env,
// so all existing routes using context?.cloudflare?.env continue to work.

declare module '@remix-run/cloudflare' {
  interface AppLoadContext {
    cloudflare?: {
      env: Record<string, string | undefined>;
    };
  }
}

export function getLoadContext() {
  return {
    cloudflare: {
      env: process.env as Record<string, string | undefined>,
    },
  };
}
