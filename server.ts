import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPort(): number {
  // 1. Check CLI args e.g. --port 3000
  const portArgIndex = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. Check DEFAULT_APP_PORT or APP_PORT (AI Studio environment defines DEFAULT_APP_PORT=3000)
  if (process.env.DEFAULT_APP_PORT) {
    const parsed = parseInt(process.env.DEFAULT_APP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (process.env.APP_PORT) {
    const parsed = parseInt(process.env.APP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 3. In AI Studio / Cloud Run container, PORT=8080 is reserved for NGINX reverse proxy.
  // Only bind to process.env.PORT if it is explicitly NOT 8080.
  if (process.env.PORT && process.env.PORT !== '8080') {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 4. Default to standard port 3000
  return 3000;
}

async function startServer() {
  const app = express();
  const PORT = getPort();

  // JSON Body Parser
  app.use(express.json());

  // Mount API Router under /api
  app.use('/api', apiRouter);

  // Health check at root for Cloud Run / load balancers / container health probes
  app.get('/_healthz', (_req, res) => {
    res.status(200).send('OK');
  });

  const distPath = path.join(__dirname, 'dist');
  const distExists = fs.existsSync(path.join(distPath, 'index.html'));
  const isDev = process.env.NODE_ENV !== 'production';

  // Mount Vite middlewares in development or static dist in production
  if (!isDev && distExists) {
    console.log('[QuizKart Backend] Running in PRODUCTION mode: serving static build from /dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[QuizKart Backend] Running in DEVELOPMENT mode: initializing Vite middleware');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    // Express SPA fallback route for dev mode
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || url === '/_healthz') {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuizKart Backend] Full-stack server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('[QuizKart Server Listen Error]:', err);
  });
}

startServer().catch((err) => {
  console.error('[QuizKart Server Startup Error]:', err);
  process.exit(1);
});
