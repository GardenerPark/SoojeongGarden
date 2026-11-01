// 메모 작업(ops). 노션 "생각과 자료" DB를 원본으로 두고, 앱은 창구만 된다.
//   meta    태그(주제)·분류(기록 유형) 목록
//   list    전체 메모 (최근 수정·이어 쓴 순)
//   get     메모 하나 (본문 포함)
//   create  새 메모
//   save    고치기. base(내가 보고 고친 버전)와 노션 현재 버전을 비교해, 양쪽이 같은 곳을 다르게 고쳤으면 덮어쓰지 않고 충돌로 돌려준다
//   append  이어 쓰기. 본문 끝에 "↳ 날짜 시각"과 함께 덧붙인다(기존 내용은 건드리지 않음)
// 메모 삭제와 DB 구조 변경은 하지 않는다. 태그는 DB에 이미 있는 주제만 붙인다.

import { appendMark, blockToLine, lastAppended, lineToBlock, lineToUpdate, normalizeBody, planBody, richText, toLines } from './blocks.js';

export const PROP = {
  title: '생각 제목',
  oneLine: '한 줄 생각',
  tags: '주제',
  kind: '기록 유형',
  source: '출처',
  uses: '활용처',
  video: '영상 활용',
  status: '정리 상태',
  date: '날짜',
};

export class NotesError extends Error {}
export class Conflict extends Error {
  constructor(remote, fields) {
    super('노션에서도 이 메모가 바뀌었어요.');
    this.remote = remote;
    this.fields = fields;
  }
}

export const OPS = ['meta', 'list', 'get', 'create', 'save', 'append'];

const FIELDS = ['title', 'body', 'tags', 'kind'];
const sameTags = (a = [], b = []) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
const sameField = (f, a, b) => (f === 'tags' ? sameTags(a, b) : (a ?? '') === (b ?? ''));

function cleanNext(next = {}) {
  const out = {
    title: String(next.title ?? '').trim().slice(0, 2000),
    body: normalizeBody(next.body ?? ''),
    tags: [...new Set((next.tags || []).map(String))],
    kind: next.kind ? String(next.kind) : null,
  };
  if (out.body.length > 200000) throw new NotesError('메모가 너무 길어요.');
  return out;
}

export function pageToMemo(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    title: richText(p[PROP.title]?.title),
    oneLine: richText(p[PROP.oneLine]?.rich_text),
    tags: (p[PROP.tags]?.multi_select || []).map((o) => o.name),
    kind: p[PROP.kind]?.select?.name || null,
    source: p[PROP.source]?.url || null,
    uses: (p[PROP.uses]?.multi_select || []).map((o) => o.name),
    video: p[PROP.video]?.select?.name || null,
    status: p[PROP.status]?.select?.name || null,
    date: p[PROP.date]?.date?.start || null,
    created: page.created_time,
    edited: page.last_edited_time,
  };
}

export function createService({ notion, dbId, timeZone = 'Asia/Seoul', clock = () => new Date() }) {
  if (!dbId) throw new Error('dbId가 필요해요.');
  const snippets = new Map(); // id → { edited, text } : 한 줄 생각이 빈 메모의 미리보기
  let schema = null;

  async function getSchema(fresh = false) {
    if (!schema || fresh) {
      const db = await notion.getDatabase(dbId);
      const props = db.properties || {};
      schema = {
        tags: (props[PROP.tags]?.multi_select?.options || []).map((o) => o.name),
        kinds: (props[PROP.kind]?.select?.options || []).map((o) => o.name),
        url: db.url,
        title: richText(db.title) || '생각과 자료',
      };
    }
    return schema;
  }

  async function readBlocks(id) {
    const out = [];
    let cursor;
    do {
      const r = await notion.listChildren(id, cursor);
      out.push(...r.results.filter((b) => !b.archived && !b.in_trash).map(blockToLine));
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    return out;
  }

  async function snapshot(id) {
    const [page, blocks] = await Promise.all([notion.getPage(id), readBlocks(id)]);
    return snapshotOf(page, blocks);
  }

  function snapshotOf(page, blocks) {
    if (page.archived || page.in_trash) throw new NotesError('노션에서 지워진 메모예요.');
    const lines = blocks.map((b) => b.line);
    const body = normalizeBody(lines.join('\n'));
    return {
      ...pageToMemo(page),
      body,
      editable: blocks.every((b) => b.simple),
      blocks: blocks.map(({ type, line, simple }) => ({ type, line, simple })),
      lastAppended: lastAppended(lines),
    };
  }

  async function snippet(memo) {
    const hit = snippets.get(memo.id);
    if (hit && hit.edited === memo.edited) return hit.text;
    const r = await notion.listChildren(memo.id, null, 6);
    const text = r.results
      .map(blockToLine)
      .map((b) => b.line)
      .filter((l) => l.trim() && !l.startsWith('↳ ') && l !== '---')
      .join(' ')
      .slice(0, 160);
    snippets.set(memo.id, { edited: memo.edited, text });
    return text;
  }

  function properties(next, only = FIELDS) {
    const props = {};
    if (only.includes('title')) props[PROP.title] = { title: next.title ? [{ type: 'text', text: { content: next.title } }] : [] };
    if (only.includes('tags')) props[PROP.tags] = { multi_select: next.tags.map((name) => ({ name })) };
    if (only.includes('kind')) props[PROP.kind] = { select: next.kind ? { name: next.kind } : null };
    return props;
  }

  async function checkOptions(next) {
    const s = await getSchema();
    const unknown = next.tags.filter((t) => !s.tags.includes(t));
    if (unknown.length) {
      const fresh = await getSchema(true);
      const still = unknown.filter((t) => !fresh.tags.includes(t));
      if (still.length) throw new NotesError(`노션에 없는 태그예요: ${still.join(', ')}`);
    }
    if (next.kind && !(await getSchema()).kinds.includes(next.kind)) throw new NotesError(`노션에 없는 분류예요: ${next.kind}`);
  }

  // 본문을 next 줄로 맞춘다. 모든 블록이 단순할 때만 부른다.
  async function writeBody(id, blocks, nextBody) {
    const old = blocks.map((b) => ({ id: b.id, type: b.type, line: b.line }));
    let { deletes, items } = planBody(old, toLines(nextBody));
    // 노션 API는 맨 앞에 끼워 넣지 못한다. 그럴 땐 본문을 통째로 다시 쓴다(모두 단순 블록이라 내용은 그대로).
    const firstInsert = items.findIndex((x) => 'insert' in x);
    if (firstInsert === 0 && items.some((x) => !('insert' in x))) {
      deletes = old.map((b) => b.id);
      items = toLines(nextBody).map((line) => ({ insert: line }));
    }
    for (const d of deletes) await notion.deleteBlock(d);
    let prev = null;
    let run = [];
    const flushRun = async () => {
      for (let k = 0; k < run.length; k += 100) {
        const r = await notion.appendChildren(id, run.slice(k, k + 100).map(lineToBlock), prev || undefined);
        prev = r.results.at(-1)?.id || prev;
      }
      run = [];
    };
    for (const it of items) {
      if ('insert' in it) {
        run.push(it.insert);
        continue;
      }
      await flushRun();
      if ('update' in it) await notion.updateBlock(it.update, lineToUpdate(it.line));
      prev = it.keep || it.update;
    }
    await flushRun();
  }

  const ops = {
    async meta() {
      return await getSchema(true);
    },

    async list() {
      const pages = [];
      let cursor;
      do {
        const r = await notion.queryDatabase(dbId, {
          page_size: 100,
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        pages.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      const memos = pages.filter((p) => !p.archived && !p.in_trash).map(pageToMemo);
      // 한 줄 생각이 없는 메모만 본문 앞부분을 미리보기로. 실패해도 목록은 보여 준다.
      await Promise.all(
        memos.filter((m) => !m.oneLine).map(async (m) => {
          try {
            m.snippet = await snippet(m);
          } catch {
            m.snippet = '';
          }
        }),
      );
      return { memos, at: clock().toISOString() };
    },

    async get({ id }) {
      if (!id) throw new NotesError('메모 id가 필요해요.');
      return await snapshot(id);
    },

    async create({ next }) {
      const n = cleanNext(next);
      if (!n.title && !n.body) throw new NotesError('빈 메모는 저장하지 않아요.');
      await checkOptions(n);
      // 저장 응답을 못 받고 다시 보낸 경우: 방금 같은 제목·본문으로 만든 메모가 있으면 그것을 쓴다.
      const since = new Date(clock().getTime() - 15 * 60000).toISOString();
      const recent = await notion.queryDatabase(dbId, {
        page_size: 10,
        filter: {
          and: [
            { timestamp: 'created_time', created_time: { on_or_after: since } },
            n.title ? { property: PROP.title, title: { equals: n.title } } : { property: PROP.title, title: { is_empty: true } },
          ],
        },
      });
      for (const p of recent.results) {
        const s = await snapshot(p.id).catch(() => null);
        if (s && s.body === n.body && s.title === n.title) return s;
      }
      const lines = toLines(n.body);
      const page = await notion.createPage({
        parent: { database_id: dbId },
        properties: properties(n),
        children: lines.slice(0, 100).map(lineToBlock),
      });
      for (let k = 100; k < lines.length; k += 100) await notion.appendChildren(page.id, lines.slice(k, k + 100).map(lineToBlock));
      return await snapshot(page.id);
    },

    async save({ id, base, next, force = false }) {
      if (!id) throw new NotesError('메모 id가 필요해요.');
      if (!base) throw new NotesError('base가 필요해요.');
      const n = cleanNext(next);
      const b = cleanNext(base);
      const [page, blocks] = await Promise.all([notion.getPage(id), readBlocks(id)]);
      const remote = snapshotOf(page, blocks);
      const changed = FIELDS.filter((f) => !sameField(f, n[f], b[f]));
      if (!changed.length) return remote;
      // 3방향 비교: 내가 바꾼 칸을 노션에서도 (다르게) 바꿨으면 충돌.
      const clash = changed.filter((f) => !sameField(f, remote[f], b[f]) && !sameField(f, remote[f], n[f]));
      if (clash.length && !force) throw new Conflict(remote, clash);
      const toWrite = changed.filter((f) => !sameField(f, remote[f], n[f]));
      if (toWrite.includes('body') && !remote.editable)
        throw new NotesError('표·이미지 같은 노션 서식이 있는 메모라 본문은 노션 원본에서 고쳐 주세요. 이어 쓰기는 돼요.');
      await checkOptions(n);
      const propFields = toWrite.filter((f) => f !== 'body');
      if (propFields.length) await notion.updatePage(id, properties(n, propFields));
      if (toWrite.includes('body')) await writeBody(id, blocks, n.body);
      return await snapshot(id);
    },

    async append({ id, text, at }) {
      if (!id) throw new NotesError('메모 id가 필요해요.');
      const lines = toLines(text);
      if (!lines.length) throw new NotesError('덧붙일 내용이 없어요.');
      const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : clock();
      const all = [appendMark(when, timeZone), ...lines];
      for (let k = 0; k < all.length; k += 100) await notion.appendChildren(id, all.slice(k, k + 100).map(lineToBlock));
      return await snapshot(id);
    },
  };

  return {
    ops,
    async run(op, args = {}) {
      if (!OPS.includes(op)) throw new NotesError('알 수 없는 작업이에요.');
      return await ops[op](args);
    },
  };
}
