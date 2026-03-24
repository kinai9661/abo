import { createRequestHandler } from '@remix-run/node';

let handler;

export default async function (req, res) {
  if (!handler) {
    const build = await import('../build/server/index.js');
    handler = createRequestHandler({
      build,
      getLoadContext() {
        return {
          cloudflare: {
            env: process.env,
          },
        };
      },
    });
  }

  return handler(req, res);
}
