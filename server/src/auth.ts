import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';

const secretPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.localmesh-secret');

// LOCALMESH_SECRET wins; otherwise reuse the saved secret, or create one on
// first start, so join tokens stay valid across restarts (npm run new-token rotates it).
async function loadSecret(): Promise<string> {
  const fromEnv = process.env.LOCALMESH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  try {
    const saved = (await readFile(secretPath, 'utf8')).trim();
    if (saved) return saved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const created = randomBytes(24).toString('base64url');
  await writeFile(secretPath, `${created}\n`, { mode: 0o600 });
  return created;
}

export const secret = await loadSecret();

/** Join token: "lm1_" + base64url("<server url>|<secret>"). moses and the MCP server split it back. */
export const joinToken = (url: string) => `lm1_${Buffer.from(`${url}|${secret}`).toString('base64url')}`;

const expected = Buffer.from(secret);

/** Every /api request must send "Authorization: Bearer <secret>". */
export const requireSecret: RequestHandler = (req, res, next) => {
  const header = req.get('authorization') ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
  if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
  return res.status(401).json({ error: 'missing or invalid LocalMesh secret' });
};
