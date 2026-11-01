// MCP(Model Context Protocol) 서버. JSON-RPC 메시지 하나를 받아 응답 하나를 돌려준다.
// HTTP(/mcp, server.js)와 stdio(mcp-stdio.js)가 이 핸들러를 같이 쓴다. 의존성 없음.

import { SNError } from './core.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'signal-noise', title: 'Signal & Noise', version: '0.1.0' };

const INSTRUCTIONS = `Signal & Noise는 "하나 끝내고 다음 하나"를 돕는 하루 집중 앱입니다.
- 오늘의 하나: 아침에 정하는 하루의 기준(하루 1개). 썸은 부가 우선순위로 최대 2개.
- 블록: 지금 실제로 하는 일. 한 번에 하나만 열 수 있고, 오늘의 하나와 다른 일(운동, 루틴)도 블록이 된다.
- 떠오른 생각은 add_thought로 바로 던진다. 분류는 블록이 끝난 뒤 전환 회고에서 sort_thought로 한다.
판단은 사용자가 한다. 사용자가 요청하지 않은 정리나 삭제(drop)는 하지 말고 제안만 하세요.`;

const str = (description) => ({ type: 'string', description });

export const TOOLS = [
  {
    name: 'get_today',
    title: '오늘 상태 보기',
    description: '오늘의 하나, 지금 블록, 지금 단계(morning/focus/review/next/closed)와 그 단계에 필요한 목록을 돌려준다.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    op: 'view',
  },
  {
    name: 'add_thought',
    title: '쏟아내기',
    description: '떠오른 생각 하나를 분류 없이 던져 둔다. 오늘의 하나를 정하기 전이면 아침 기록, 이후면 다음 전환 회고에서 거를 목록에 들어간다.',
    inputSchema: { type: 'object', properties: { text: str('떠오른 생각 그대로') }, required: ['text'] },
    op: 'dump',
    map: (a) => ({ text: a.text, source: 'mcp' }),
  },
  {
    name: 'set_today_one',
    title: '오늘의 하나 정하기',
    description: '오늘의 하나(필수)와 썸(최대 2개)을 정한다. 고르지 않은 아침 생각은 보관함으로 간다. fromIds에 아침 기록·보관함에서 고른 생각의 id를 넣으면 고른 것으로 표시된다.',
    inputSchema: {
      type: 'object',
      properties: {
        one: str('오늘의 하나'),
        some: { type: 'array', items: { type: 'string' }, maxItems: 2, description: '썸, 최대 2개' },
        fromIds: { type: 'array', items: { type: 'string' }, description: '고른 생각의 id' },
      },
      required: ['one'],
    },
    op: 'setOne',
  },
  {
    name: 'start_block',
    title: '블록 시작',
    description: '지금 할 일 하나를 블록으로 시작한다. declaration에 "필라테스 2시간", "촬영 대본 정리 90분"처럼 말한 그대로 넣으면 이름과 시간을 나눈다. 이미 열린 블록이 있으면 실패한다.',
    inputSchema: {
      type: 'object',
      properties: {
        declaration: str('말로 한 시작 선언'),
        title: str('블록 이름 (declaration 대신)'),
        minutes: { type: 'integer', minimum: 1, maximum: 720, description: '예정 시간(분)' },
        related: { type: 'boolean', description: '오늘의 하나를 위한 블록인지' },
        fromId: str('다음 하나 후보(now)에서 고른 생각의 id'),
      },
    },
    op: 'start',
  },
  {
    name: 'end_block',
    title: '블록 끝내기',
    description: '지금 블록을 끝내고 전환 회고로 넘어간다. 거를 생각 목록(review)을 함께 돌려준다.',
    inputSchema: { type: 'object', properties: { note: str('어디까지 했는지 한 줄') } },
    op: 'end',
  },
  {
    name: 'list_thoughts',
    title: '쏟아낸 생각 보기',
    description: 'review: 아직 거르지 않은 것, next: 지금 하기로 고른 것, archive: 보관함, morning: 오늘 아침 기록.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['review', 'next', 'archive', 'morning'] } } },
    annotations: { readOnlyHint: true },
    op: 'list',
  },
  {
    name: 'sort_thought',
    title: '생각 거르기',
    description: '쏟아낸 생각 하나를 now(지금 하기 후보) / keep(보관함, 다음 날 아침 다시 보임) / drop(지우기)으로 거른다.',
    inputSchema: {
      type: 'object',
      properties: { id: str('생각의 id'), action: { type: 'string', enum: ['now', 'keep', 'drop'] } },
      required: ['id', 'action'],
    },
    annotations: { destructiveHint: true },
    op: 'sort',
  },
  {
    name: 'close_day',
    title: '하루 마무리',
    description: '오늘을 마무리한다. 열린 블록은 끝내고, 거르지 않은 생각은 내일 아침 보관함으로 보낸다. 끝낸 하나의 수를 돌려준다.',
    inputSchema: { type: 'object', properties: {} },
    op: 'close',
  },
  {
    name: 'get_day',
    title: '하루 기록 보기',
    description: '날짜별 기록: 오늘의 하나, 블록 목록, 끝낸 하나의 수(finishedCount), 그중 오늘의 하나를 위한 블록 수(relatedCount).',
    inputSchema: { type: 'object', properties: { date: str('YYYY-MM-DD, 없으면 오늘') } },
    annotations: { readOnlyHint: true },
    op: 'day',
  },
];

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

export function createMcpHandler(service) {
  const byName = new Map(TOOLS.map((t) => [t.name, t]));

  async function callTool({ name, arguments: args = {} } = {}) {
    const tool = byName.get(name);
    if (!tool) return { content: [{ type: 'text', text: `알 수 없는 도구예요: ${name}` }], isError: true };
    try {
      const result = await service.run(tool.op, tool.map ? tool.map(args) : args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      if (!(e instanceof SNError)) console.error('[mcp]', e);
      return { content: [{ type: 'text', text: e instanceof SNError ? e.message : '처리하지 못했어요.' }], isError: true };
    }
  }

  // 응답이 없는 메시지(알림, 응답)는 null.
  return async function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return msg && 'id' in msg && !('result' in msg || 'error' in msg) ? fail(msg.id ?? null, -32600, 'Invalid Request') : null;
    }
    const { id, method, params } = msg;
    if (id === undefined) return null;
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return ok(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: TOOLS.map(({ op, map, ...t }) => t) });
      case 'tools/call':
        return ok(id, await callTool(params));
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  };
}
