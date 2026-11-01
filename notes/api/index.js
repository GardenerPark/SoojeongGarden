// Vercel 함수: /api/*를 받는다(vercel.json의 rewrites). 웹앱은 web/에서 정적으로 나간다.
// NOTES_TOKEN이 없으면 열지 않는다(노션 내용이 공개 주소로 새지 않게).

import { createApiHandler, send } from '../http.js';
import { serviceFromEnv } from '../setup.js';

const token = process.env.NOTES_TOKEN || '';
const api = createApiHandler({ token, service: serviceFromEnv().service });

export default async function handler(req, res) {
  if (!token) return send(res, 503, { error: 'NOTES_TOKEN이 설정되지 않았어요.' });
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original) {
    url.searchParams.delete('__path');
    url.searchParams.delete('op');
    req.url = original + (url.searchParams.size ? `?${url.searchParams}` : '');
  }
  if (!(await api(req, res))) send(res, 404, { error: 'not found' });
}
