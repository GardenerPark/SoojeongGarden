// 환경변수로 서비스를 만든다. 로컬 서버와 Vercel 함수가 같이 쓴다.
//   NOTION_TOKEN    노션 내부 연결(integration) 토큰. 서버에만 둔다
//   NOTES_DB_ID     생각과 자료 DB id (기본값: 수정님 DB)
//   NOTES_DEMO=1    노션 없이 예시 메모로 체험
import { createNotion } from './notion.js';
import { createService } from './service.js';
import { createFakeNotion, seedDemo } from './fake-notion.js';

export const DEFAULT_DB_ID = 'b033454549704b6180c70f48aafce717';

export function serviceFromEnv(env = process.env) {
  const timeZone = env.NOTES_TZ || 'Asia/Seoul';
  if (env.NOTES_DEMO === '1') {
    const fake = createFakeNotion();
    seedDemo(fake);
    return { service: createService({ notion: fake, dbId: fake.dbId, timeZone }), mode: 'demo' };
  }
  if (!env.NOTION_TOKEN) return { service: null, mode: 'missing' };
  const notion = createNotion({ token: env.NOTION_TOKEN, version: env.NOTION_VERSION || '2022-06-28' });
  return { service: createService({ notion, dbId: env.NOTES_DB_ID || DEFAULT_DB_ID, timeZone }), mode: 'notion' };
}
