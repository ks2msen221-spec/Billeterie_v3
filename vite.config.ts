import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// Custom plugin to route API requests to the Cloudflare Worker during development
function cloudflareWorkerPlugin() {
  return {
    name: 'cloudflare-worker-dev',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url.startsWith('/api') || url.startsWith('/billet/telecharger')) {
          try {
            // Dynamically import the worker to ensure it is fresh
            const workerModule = await import('./cloudflare-worker.js');
            const worker = workerModule.default;

            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host || 'localhost:3000';
            const fullUrl = `${protocol}://${host}${url}`;

            const headers = new Headers();
            for (const [key, val] of Object.entries(req.headers)) {
              if (val !== undefined) {
                if (Array.isArray(val)) {
                  val.forEach(v => headers.append(key, v));
                } else {
                  headers.set(key, val as string);
                }
              }
            }

            let body: any = null;
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              const buffers: Buffer[] = [];
              for await (const chunk of req) {
                buffers.push(Buffer.from(chunk));
              }
              body = Buffer.concat(buffers);
            }

            const webRequest = new Request(fullUrl, {
              method: req.method,
              headers,
              body,
            });

            const env = {
              ...process.env,
            };

            const response = await worker.fetch(webRequest, env, {
              waitUntil: () => {},
              passThroughOnException: () => {},
            });

            res.statusCode = response.status;
            response.headers.forEach((value: string, key: string) => {
              res.setHeader(key, value);
            });

            if (response.body) {
              const reader = response.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            }
            res.end();
          } catch (error: any) {
            console.error("Worker Execution Error:", error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message || "Internal Worker Error" }));
          }
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cloudflareWorkerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
