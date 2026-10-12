import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ErrorRequestHandler } from 'express';
import { router } from './routes.js';
import { pruneStaleAgents } from './store.js';
import { joinToken, requireSecret, secret } from './auth.js';

const app = express();
const port = Number(process.env.PORT) || 4777;
// Agents that have not sent a heartbeat for five minutes are dropped from state.json.
const agentMaxAgeMs = 5 * 60_000;
const pruneIntervalMs = 60_000;
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
// No CORS: the dashboard is same-origin, and other sites must not reach the API.
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const started = Date.now();
  // Skip routine successes (dashboard polling, heartbeats) so the join token
  // printed at startup stays on screen; log writes and every failure.
  res.on('finish', () => {
    const routine = req.method === 'GET' || req.path === '/api/agents/heartbeat';
    if (routine && res.statusCode < 400) return;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', requireSecret, router);
const jsonErrors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const status = typeof error === 'object' && error !== null && 'status' in error &&
    typeof error.status === 'number' ? error.status : 500;
  if (status === 413) return res.status(413).json({ error: 'request body is too large' });
  if (status === 400) return res.status(400).json({ error: 'invalid JSON request body' });
  console.error('Unhandled request error:', error);
  return res.status(500).json({ error: 'internal server error' });
};
app.use(jsonErrors);
async function pruneAgents() {
  try {
    const removed = await pruneStaleAgents(agentMaxAgeMs);
    if (removed) console.log(`Removed ${removed} agent(s) not seen for over five minutes`);
  } catch (error) {
    console.error('Agent cleanup failed:', error);
  }
}
void pruneAgents();
setInterval(pruneAgents, pruneIntervalMs).unref();
app.listen(port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flatMap(items => items ?? [])
    .filter(item => item.family === 'IPv4' && !item.internal).map(item => `http://${item.address}:${port}`);
  console.log(`LocalMesh server listening: http://localhost:${port}${lan.length ? ` | LAN: ${[...new Set(lan)].join(', ')}` : ''}`);
  // The join token carries the address and the secret; share it only with your team.
  for (const url of lan.length ? [...new Set(lan)] : [`http://localhost:${port}`]) {
    console.log(`\nJoin token for ${url}:\n  ${joinToken(url)}`);
    console.log(`  Start an agent: moses claude --name <name> --token ${joinToken(url)}`);
    console.log(`  Dashboard:      ${url}/#secret=${secret}`);
  }
});
