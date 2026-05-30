import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const cacheDir = path.join(root, 'assets', 'cache');
const logPath = path.join(cacheDir, 'fetch-log.txt');

await mkdir(cacheDir, { recursive: true });
await appendFile(
  logPath,
  `[${new Date().toISOString()}] setup complete: placeholder assets active; no external downloads configured yet\n`,
);

console.log(`Asset cache ready: ${cacheDir}`);
