// Runs before the server on every `npm run dev` / `npm start`: replaces the
// secret so each server run gets a new join token. tsx watch restarts reuse it,
// because they do not run this script. LOCALMESH_SECRET, when set, wins instead.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.LOCALMESH_SECRET?.trim()) {
  const secretPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.localmesh-secret');
  await writeFile(secretPath, `${randomBytes(24).toString('base64url')}\n`, { mode: 0o600 });
}
