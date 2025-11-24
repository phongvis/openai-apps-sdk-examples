import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { SummariseArgs } from './src/services/summarise';
import { summariseLocally } from './src/services/summarise';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (!process.env.OPENAI_API_KEY && env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }

  return {
    plugins: [
      react(),
      {
        name: 'local-summarise-endpoint',
        configureServer(server) {
          server.middlewares.use(
            '/api/local-summarise',
            async (req, res, next) => {
              if (req.method !== 'POST') {
                next();
                return;
              }

              try {
                const chunks: Uint8Array[] = [];
                for await (const chunk of req) {
                  chunks.push(chunk as Uint8Array);
                }

                const body = Buffer.concat(chunks).toString() || '{}';
                const payload = JSON.parse(body) as SummariseArgs;
                const result = await summariseLocally(payload);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (error) {
                console.error('Local summarise endpoint failed', error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Failed to summarise request',
                  })
                );
              }
            }
          );
        },
      },
    ],
    server: {
      port: 5173,
      open: false,
    },
  };
});
