import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService, memoryStore } from '../service.js';
import { createMcpHandler } from '../mcp.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const call = (handle, id, name, args = {}) => handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const parse = (reply) => JSON.parse(reply.result.content[0].text);

test('MCP: 초기화, 도구 목록, 도구 호출', () => {
  const handle = createMcpHandler(createService({ store: memoryStore() }));
  const init = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.ok(init.result.capabilities.tools);
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);

  const names = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.deepEqual(names, ['get_today', 'add_thought', 'set_today_one', 'start_block', 'end_block', 'list_thoughts', 'sort_thought', 'close_day', 'get_day']);

  call(handle, 3, 'add_thought', { text: '유튜브 촬영' });
  call(handle, 4, 'set_today_one', { one: '유튜브 촬영' });
  const block = parse(call(handle, 5, 'start_block', { declaration: '필라테스 2시간' }));
  assert.equal(block.title, '필라테스');
  assert.equal(block.related, false);

  const busy = call(handle, 6, 'start_block', { declaration: '편집 30분' });
  assert.equal(busy.result.isError, true);
  assert.match(busy.result.content[0].text, /지금 하는 블록/);

  assert.equal(parse(call(handle, 7, 'get_today')).phase, 'focus');
  assert.equal(handle({ jsonrpc: '2.0', id: 8, method: 'nope' }).error.code, -32601);
});

test('HTTP 서버: 토큰 없이는 401, 토큰으로 API와 MCP 사용', async (t) => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const dir = mkdtempSync(join(tmpdir(), 'sn-'));
  const proc = spawn(process.execPath, [join(HERE, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SN_TOKEN: 'secret', SN_DATA: join(dir, 'store.json') },
    stdio: 'ignore',
  });
  t.after(() => proc.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  assert.equal((await fetch(`${base}/api/view`, { method: 'POST' })).status, 401);
  const auth = { Authorization: 'Bearer secret', 'Content-Type': 'application/json' };
  const dump = await fetch(`${base}/api/dump`, { method: 'POST', headers: auth, body: JSON.stringify({ text: '단축어로 던진 생각' }) });
  assert.equal(dump.status, 200);

  const rpc = (body) => fetch(`${base}/mcp?token=secret`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) });
  assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const today = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_today', arguments: {} } })).json();
  assert.equal(JSON.parse(today.result.content[0].text).morning[0].text, '단축어로 던진 생각');

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.equal((await fetch(`${base}/../server.js`)).status, 404);
});
