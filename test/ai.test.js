import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { TASKS, extractJson } from '../server/prompts.js';
import { providerConfig, complete } from '../server/providers.js';

test('모델 답에서 JSON을 꺼내고 검증한다', () => {
  assert.deepEqual(extractJson('```json\n{"space":"focus","reason":"업무"}\n```'), { space: 'focus', reason: '업무' });
  assert.equal(extractJson('모르겠어요'), null);
  assert.deepEqual(TASKS.route.parse({ space: 'energy', reason: '피곤' }), { space: 'energy', reason: '피곤' });
  assert.equal(TASKS.route.parse({ space: 'shopping' }), null);
  assert.equal(TASKS.firstStep.parse({ step: '  ' }), null);
});

test('프리셋: 구독 로그인 도구의 기본 로컬 주소', () => {
  assert.equal(providerConfig({ AI_PROVIDER: 'openclaw' }).baseUrl, 'http://127.0.0.1:18789/v1');
  assert.equal(providerConfig({ AI_PROVIDER: 'openclaw' }).model, 'openclaw/default');
  assert.equal(providerConfig({ AI_PROVIDER: 'hermes' }).baseUrl, 'http://127.0.0.1:8642/v1');
  assert.equal(providerConfig({ AI_PROVIDER: 'hermes' }).model, 'hermes-agent');
  assert.equal(providerConfig({}).name, 'none');
});

test('OpenAI 호환 게이트웨이(Hermes/OpenClaw)에 토큰과 함께 요청한다', async () => {
  let seen;
  const srv = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"step":"핵심 문장 세 개 쓰기"}' } }] }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const cfg = providerConfig({ AI_PROVIDER: 'hermes', AI_BASE_URL: `http://127.0.0.1:${srv.address().port}/v1`, AI_TOKEN: 'k' });
  const t = TASKS.firstStep;
  const text = await complete(cfg, t.system, t.user({ task: '제안서 작성', energy: 2, minutes: 10 }));
  srv.close();
  assert.equal(seen.url, '/v1/chat/completions');
  assert.equal(seen.auth, 'Bearer k');
  assert.equal(seen.body.model, 'hermes-agent');
  assert.match(seen.body.messages[1].content, /에너지: 2\/5/);
  assert.deepEqual(t.parse(extractJson(text)), { step: '핵심 문장 세 개 쓰기' });
});
