// 로컬 전용 서버: 정적 파일 + /api/ai 중계. 의존성 없음.
//   npm start  →  http://localhost:8000

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerConfig, complete } from './server/providers.js';
import { TASKS, extractJson } from './server/prompts.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

// .env (KEY=VALUE) 읽기. 이미 있는 환경변수가 우선.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const cfg = providerConfig();
const PORT = Number(process.env.PORT) || 8000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) throw new Error('too large');
  }
  return JSON.parse(raw || '{}');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/ai/status') {
    return send(res, 200, { provider: cfg.name, label: cfg.label, enabled: cfg.name !== 'none' });
  }

  if (url.pathname === '/api/ai' && req.method === 'POST') {
    try {
      const { task, input } = await readJson(req);
      const t = TASKS[task];
      if (!t) return send(res, 400, { error: 'unknown task' });
      const text = await complete(cfg, t.system, t.user(input || {}));
      const result = t.parse(extractJson(text));
      if (!result) return send(res, 502, { error: 'AI 응답을 해석하지 못했어요.' });
      return send(res, 200, { result, provider: cfg.name });
    } catch (e) {
      console.error('[ai]', e.message);
      return send(res, 503, { error: e.message });
    }
  }

  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || /(^|\/)(\.|server|node_modules)/.test(path.slice(1))) return send(res, 404, 'not found', 'text/plain');
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Soojeong Garden → http://localhost:${PORT}`);
  console.log(`AI: ${cfg.label}${cfg.baseUrl && cfg.name !== 'none' && cfg.name !== 'claude-cli' ? ` (${cfg.baseUrl}, model=${cfg.model})` : ''}`);
});
