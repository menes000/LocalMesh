import express from 'express';
import cors from 'cors';
import os from 'node:os';
import { router } from './routes.js';

const app = express();
const port = Number(process.env.PORT) || 4777;
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`));
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', router);
app.listen(port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flatMap(items => items ?? [])
    .filter(item => item.family === 'IPv4' && !item.internal).map(item => `http://${item.address}:${port}`);
  console.log(`PeerSync server listening: http://localhost:${port}${lan.length ? ` | LAN: ${[...new Set(lan)].join(', ')}` : ''}`);
});
