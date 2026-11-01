// Signal & Noise 로컬 서버: 웹앱(web/) + REST API(/api/*) + MCP(/mcp). 기록은 JSON 파일 하나.
//   node signal-noise/server.js  →  http://localhost:8100
// SN_TOKEN을 정하면 모든 /api, /mcp 요청에 토큰이 필요하고, 휴대폰에서 접속할 수 있게 0.0.0.0에서 연다.
// Vercel 배포는 api/index.js가 같은 핸들러를 쓴다.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService, fileStore } from './service.js';
import { createApiHandler, send } from './http.js';

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

const TOKEN = process.env.SN_TOKEN || '';
const PORT = Number(process.env.PORT) || 8100;
const HOST = process.env.HOST || (TOKEN ? '0.0.0.0' : '127.0.0.1');
const api = createApiHandler({
  token: TOKEN,
  service: createService({
    store: fileStore(process.env.SN_DATA || join(ROOT, 'data', 'store.json')),
    timeZone: process.env.SN_TZ || 'Asia/Seoul',
  }),
});

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
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
  console.log(`Signal & Noise → http://${shown}:${PORT}`);
  console.log(`MCP → http://${shown}:${PORT}/mcp${TOKEN ? ' (토큰 필요)' : ''}`);
});
