// 저장소 + 하루 규칙을 묶은 실행 창구. 웹앱(REST)과 MCP가 같은 ops를 쓴다.
// 저장은 JSON 파일 하나. 매 작업마다 새로 읽고 써서, 서버와 stdio MCP가 같은 파일을 함께 써도 된다.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as core from './core.js';

export function fileStore(path) {
  const load = () => (existsSync(path) ? { ...core.emptyState(), ...JSON.parse(readFileSync(path, 'utf8')) } : core.emptyState());
  return {
    load,
    save(state) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 1));
      renameSync(tmp, path);
    },
  };
}

export function memoryStore(initial = core.emptyState()) {
  let state = structuredClone(initial);
  return { load: () => structuredClone(state), save: (s) => (state = structuredClone(s)) };
}

const WRITE = {
  dump: core.addDump,
  setOne: core.setOne,
  start: core.startBlock,
  end: core.endBlock,
  note: core.noteBlock,
  sort: core.sortDump,
  finishReview: core.finishReview,
  close: core.closeDay,
};
const READ = {
  view: (s, _a, ctx) => core.view(s, ctx),
  day: (s, a, ctx) => core.summary(s, a?.date || ctx.date),
  list: (s, a) => core.listDumps(s, a),
};
export const OPS = [...Object.keys(WRITE), ...Object.keys(READ)];

export function createService({ store, timeZone = 'Asia/Seoul', clock = () => new Date() }) {
  return {
    run(op, args = {}) {
      const fn = WRITE[op] || READ[op];
      if (!fn) throw new core.SNError(`알 수 없는 작업이에요: ${op}`);
      const now = clock();
      const ctx = { now, date: core.dayKey(now, timeZone) };
      const state = store.load();
      core.rollover(state, ctx);
      const result = fn(state, args || {}, ctx);
      if (WRITE[op]) store.save(state);
      return result;
    },
  };
}
