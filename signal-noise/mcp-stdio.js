// stdio MCP 서버: Claude Desktop·Claude Code 같은 로컬 MCP 클라이언트용. 한 줄에 JSON-RPC 메시지 하나.
// 웹앱 서버와 같은 데이터 파일(SN_DATA, 기본 signal-noise/data/store.json)을 읽고 쓴다.

import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService, fileStore } from './service.js';
import { createMcpHandler } from './mcp.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const handle = createMcpHandler(
  createService({
    store: fileStore(process.env.SN_DATA || join(ROOT, 'data', 'store.json')),
    timeZone: process.env.SN_TZ || 'Asia/Seoul',
  }),
);

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const replies = (await Promise.all((Array.isArray(msg) ? msg : [msg]).map(handle))).filter(Boolean);
  if (replies.length) write(Array.isArray(msg) ? replies : replies[0]);
});
