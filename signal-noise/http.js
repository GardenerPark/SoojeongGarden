// /api/<op>(REST)와 /mcp(MCP, Streamable HTTP의 JSON 응답)를 처리하는 요청 핸들러.
// 로컬 서버(server.js)와 Vercel 함수(api/index.js)가 같이 쓴다.
// token이 있으면 Authorization: Bearer <토큰> 헤더나 ?token=<토큰> 이 맞아야 한다.

import { timingSafeEqual } from 'node:crypto';
import { SNError } from './core.js';
import { OPS } from './service.js';
import { createMcpHandler } from './mcp.js';

export const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

async function readJson(req) {
  if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body ?? {};
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

export function createApiHandler({ service, token = '' }) {
  const mcp = createMcpHandler(service);

  function authorized(req, url) {
    if (!token) {
      // 토큰 없이 로컬로 열 때: 다른 사이트에서 오는 브라우저 요청은 막는다(DNS 리바인딩 방지).
      const origin = req.headers.origin;
      return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    }
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    const a = Buffer.from(given);
    const b = Buffer.from(token);
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
    const replies = (await Promise.all((Array.isArray(body) ? body : [body]).map(mcp))).filter(Boolean);
    if (!replies.length) return send(res, 202);
    return send(res, 200, Array.isArray(body) ? replies : replies[0]);
  }

  async function handleApi(req, res, url, op) {
    if (!OPS.includes(op)) return send(res, 404, { error: '알 수 없는 작업이에요.' });
    try {
      const args = req.method === 'POST' ? await readJson(req) : Object.fromEntries(url.searchParams);
      delete args.token;
      return send(res, 200, { result: await service.run(op, args) });
    } catch (e) {
      if (e instanceof SNError) return send(res, 400, { error: e.message });
      console.error('[api]', e);
      return send(res, 500, { error: '처리하지 못했어요.' });
    }
  }

  // 처리했으면 true. /api, /mcp가 아니면 false를 돌려 정적 파일 쪽으로 넘긴다.
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const isApi = url.pathname.startsWith('/api/');
    if (!isApi && url.pathname !== '/mcp') return false;
    if (!authorized(req, url)) {
      send(res, 401, { error: '토큰이 필요해요.' });
      return true;
    }
    await (isApi ? handleApi(req, res, url, url.pathname.slice(5)) : handleMcp(req, res));
    return true;
  };
}
