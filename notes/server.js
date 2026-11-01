// 생각과 자료 메모 앱 로컬 서버: 웹앱(web/) + REST API(/api/*).
//   node notes/server.js  →  http://localhost:8200
// NOTES_TOKEN을 정하면 모든 /api 요청에 토큰이 필요하고, 휴대폰에서 접속할 수 있게 0.0.0.0에서 연다.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler, send } from './http.js';
import { serviceFromEnv } from './setup.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const WEB = join(ROOT, 'web');

// .env (KEY=VALUE) 읽기. 이미 있는 환경변수가 우선.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const TOKEN = process.env.NOTES_TOKEN || '';
const PORT = Number(process.env.PORT) || 8200;
const HOST = process.env.HOST || (TOKEN ? '0.0.0.0' : '127.0.0.1');
const { service, mode } = serviceFromEnv();
const api = createApiHandler({ token: TOKEN, service });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  if (await api(req, res)) return;
  const url = new URL(req.url, 'http://localhost');
  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = join(WEB, path);
  if (!file.startsWith(WEB)) return send(res, 404, 'not found', 'text/plain');
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`생각과 자료 → http://${shown}:${PORT}`);
  if (mode === 'demo') console.log('체험 모드: 예시 메모로 동작해요 (노션에 쓰지 않음, 끄면 사라짐).');
  if (mode === 'missing') console.log('NOTION_TOKEN이 없어요. notes/.env에 넣거나 NOTES_DEMO=1로 체험해 보세요.');
});
