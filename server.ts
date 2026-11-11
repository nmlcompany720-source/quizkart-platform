import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON Body Parser
  app.use(express.json());

  // Mount API Router under /api
  app.use('/api', apiRouter);

  // Health check at root for Cloud Run / load balancers
  app.get('/_healthz', (_req, res) => {
    res.status(200).send('OK');
  });

  const distPath = path.join(__dirname, 'dist');
  const distExists = fs.existsSync(path.join(distPath, 'index.html'));
  const isDev = process.env.NODE_ENV === 'development';

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
        port: PORT
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuizKart Backend] Full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[QuizKart Server Startup Error]:', err);
  process.exit(1);
});
