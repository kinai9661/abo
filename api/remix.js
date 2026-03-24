import { createRequestHandler } from '@remix-run/node';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let handler;

export default async function (req, res) {
  if (!handler) {
    const buildPath = resolve(__dirname, '../build/server/index.js');
    const build = await import(buildPath);
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
