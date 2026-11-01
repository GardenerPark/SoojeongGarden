// 저장소 + 하루 규칙을 묶은 실행 창구. 웹앱(REST)과 MCP가 같은 ops를 쓴다.
// 저장소는 load() → { state, version }, save(state, version)만 지키면 된다.
//  - fileStore: JSON 파일 하나 (로컬 서버, stdio MCP)
//  - blobStore: Vercel Blob 비공개 저장소 (Vercel 배포, store-blob.js)
// 매 작업마다 새로 읽고, 그사이 다른 곳에서 바뀌었으면(VersionConflict) 다시 읽어서 한 번 더 한다.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as core from './core.js';

export class VersionConflict extends Error {}

const parse = (text) => ({ ...core.emptyState(), ...JSON.parse(text) });

export function fileStore(path) {
  return {
    async load() {
      return { state: existsSync(path) ? parse(readFileSync(path, 'utf8')) : core.emptyState(), version: null };
    },
    async save(state) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 1));
      renameSync(tmp, path);
    },
  };
}

export function memoryStore(initial = core.emptyState()) {
  let text = JSON.stringify(initial);
  let version = 0;
  return {
    async load() {
      return { state: parse(text), version };
    },
    async save(state, expected) {
      if (expected !== version) throw new VersionConflict();
      text = JSON.stringify(state);
      version += 1;
    },
  };
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
    async run(op, args = {}) {
      const fn = WRITE[op] || READ[op];
      if (!fn) throw new core.SNError(`알 수 없는 작업이에요: ${op}`);
      for (let attempt = 0; ; attempt++) {
        const now = clock();
        const ctx = { now, date: core.dayKey(now, timeZone) };
        const { state, version } = await store.load();
        core.rollover(state, ctx);
        const result = fn(state, args || {}, ctx);
        if (!WRITE[op]) return result;
        try {
          await store.save(state, version);
          return result;
        } catch (e) {
          if (!(e instanceof VersionConflict) || attempt >= 3) throw e;
        }
      }
    },
  };
}
