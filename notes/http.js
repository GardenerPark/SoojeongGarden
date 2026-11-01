// /api/<op> 요청 처리. 로컬 서버(server.js)와 Vercel 함수(api/index.js)가 같이 쓴다.
// token이 있으면 Authorization: Bearer <토큰> 헤더나 ?token=<토큰>이 맞아야 한다.
// 노션 토큰은 서버 환경변수에만 있고, 응답에는 절대 담지 않는다.

import { timingSafeEqual } from 'node:crypto';
import { Conflict, NotesError, OPS } from './service.js';
import { NotionError } from './notion.js';

export const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

async function readJson(req) {
  if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body ?? {};
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new NotesError('요청이 너무 커요.');
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new NotesError('JSON을 읽지 못했어요.');
  }
}

export function createApiHandler({ service, token = '' }) {
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

  // 처리했으면 true. /api가 아니면 false를 돌려 정적 파일 쪽으로 넘긴다.
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    if (!authorized(req, url)) return send(res, 401, { error: '토큰이 필요해요.' }), true;
    const op = url.pathname.slice(5);
    if (!OPS.includes(op)) return send(res, 404, { error: '알 수 없는 작업이에요.' }), true;
    if (!service) return send(res, 503, { error: '노션 연결 정보가 서버에 설정되지 않았어요.' }), true;
    try {
      const args = req.method === 'POST' ? await readJson(req) : Object.fromEntries(url.searchParams);
      delete args.token;
      send(res, 200, { result: await service.run(op, args) });
    } catch (e) {
      if (e instanceof Conflict) send(res, 409, { error: e.message, conflict: { remote: e.remote, fields: e.fields } });
      else if (e instanceof NotesError) send(res, 400, { error: e.message });
      else if (e instanceof NotionError) {
        console.error('[notion]', e.status, e.code, e.message);
        const msg = e.status === 401 ? '노션 연결 정보가 맞지 않아요.' : e.status === 404 ? '노션에서 찾지 못했어요. 연결(integration)에 DB가 공유됐는지 확인해 주세요.' : e.message;
        send(res, 502, { error: msg });
      } else {
        console.error('[api]', e);
        send(res, 500, { error: '처리하지 못했어요.' });
      }
    }
    return true;
  };
}
