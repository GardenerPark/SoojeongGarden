// Signal & Noise 서버: 웹앱(web/) + REST API(/api/*) + MCP(/mcp). 의존성 없음.
//   node signal-noise/server.js  →  http://localhost:8100
// SN_TOKEN을 정하면 모든 /api, /mcp 요청에 토큰이 필요하고, 휴대폰에서 접속할 수 있게 0.0.0.0에서 연다.
// 토큰은 Authorization: Bearer <토큰> 헤더나 ?token=<토큰> 으로 보낸다.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SNError } from './core.js';
import { createService, fileStore, OPS } from './service.js';
import { createMcpHandler } from './mcp.js';

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
const service = createService({
  store: fileStore(process.env.SN_DATA || join(ROOT, 'data', 'store.json')),
  timeZone: process.env.SN_TZ || 'Asia/Seoul',
});
const mcp = createMcpHandler(service);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100000) throw new SNError('요청이 너무 커요.');
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new SNError('JSON을 읽지 못했어요.');
  }
}

function authorized(req, url) {
  if (!TOKEN) {
    // 토큰 없이 로컬로 열 때: 다른 사이트에서 오는 브라우저 요청은 막는다(DNS 리바인딩 방지).
    const origin = req.headers.origin;
    return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleMcp(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const replies = (Array.isArray(body) ? body : [body]).map(mcp).filter(Boolean);
  if (!replies.length) return send(res, 202);
  return send(res, 200, Array.isArray(body) ? replies : replies[0]);
}

async function handleApi(req, res, op) {
  if (!OPS.includes(op)) return send(res, 404, { error: '알 수 없는 작업이에요.' });
  try {
    const args = req.method === 'POST' ? await readJson(req) : Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    delete args.token;
    return send(res, 200, { result: service.run(op, args) });
  } catch (e) {
    if (e instanceof SNError) return send(res, 400, { error: e.message });
    console.error('[api]', e);
    return send(res, 500, { error: '처리하지 못했어요.' });
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const isApi = url.pathname.startsWith('/api/');
  if (isApi || url.pathname === '/mcp') {
    if (!authorized(req, url)) return send(res, 401, { error: '토큰이 필요해요.' });
    return isApi ? handleApi(req, res, url.pathname.slice(5)) : handleMcp(req, res);
  }

  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = join(WEB, path);
  if (!file.startsWith(WEB)) return send(res, 404, 'not found', 'text/plain');
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, HOST, () => {
  console.log(`Signal & Noise → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`MCP → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/mcp${TOKEN ? ' (토큰 필요)' : ''}`);
});
