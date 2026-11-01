// Vercel 함수: /api/*와 /mcp를 받는다(vercel.json의 rewrites). 웹앱은 web/에서 정적으로 나간다.
// 기록은 Vercel Blob 비공개 저장소에. SN_TOKEN이 없으면 열지 않는다.

import { createService } from '../service.js';
import { blobStore } from '../store-blob.js';
import { createApiHandler, send } from '../http.js';

const token = process.env.SN_TOKEN || '';
const api = createApiHandler({
  token,
  service: createService({ store: blobStore(), timeZone: process.env.SN_TZ || 'Asia/Seoul' }),
});

export default async function handler(req, res) {
  if (!token) return send(res, 503, { error: 'SN_TOKEN이 설정되지 않았어요.' });
  // rewrites가 원래 경로를 __path로 넘긴다. 그 경로로 되돌려 같은 핸들러에 맡긴다.
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original) {
    url.searchParams.delete('__path');
    url.searchParams.delete('op');
    req.url = original + (url.searchParams.size ? `?${url.searchParams}` : '');
  }
  if (!(await api(req, res))) send(res, 404, { error: 'not found' });
}
