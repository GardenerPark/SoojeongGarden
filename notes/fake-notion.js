// 메모리 위의 가짜 노션. 테스트와 체험 모드(NOTES_DEMO=1)에서 쓴다. notion.js와 같은 메서드만 흉내 낸다.

import { randomUUID } from 'node:crypto';

const rt = (s) => (s ? [{ type: 'text', text: { content: s, link: null }, plain_text: s, annotations: {} }] : []);
const minute = (d) => new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString().replace(/\.\d{3}Z$/, '.000Z');

export const SAMPLE_SCHEMA = {
  tags: ['일상', '명상', '몸과 에너지', '일과 전환', '관계', '배움', '창작'],
  kinds: ['질문·단상', '아이디어', '정보·레퍼런스', '경험·회고'],
};

export function createFakeNotion({ clock = () => new Date(), schema = SAMPLE_SCHEMA } = {}) {
  const pages = new Map(); // id → page
  const children = new Map(); // id → [block]
  const blocks = new Map(); // id → block
  const calls = [];
  const dbId = 'db-fake';

  const touch = (pageId) => {
    const p = pages.get(pageId);
    if (p) p.last_edited_time = minute(clock());
  };
  const pageOf = (blockId) => (pages.has(blockId) ? blockId : blocks.get(blockId)?.parent);
  const makeBlock = (parent, b) => {
    const block = { object: 'block', id: randomUUID(), has_children: false, archived: false, ...structuredClone(b), parent };
    const data = block[block.type];
    if (data?.rich_text) data.rich_text = data.rich_text.map((t) => ({ ...t, plain_text: t.text.content, annotations: t.annotations || {} }));
    blocks.set(block.id, block);
    return block;
  };
  const err = (status, message) => Object.assign(new Error(message), { status });

  const api = {
    calls,
    dbId,
    pages,
    // 테스트용: 노션에서 직접 고친 것처럼
    seed({ title, oneLine = '', tags = [], kind = null, created }) {
      const id = randomUUID();
      const at = created || minute(clock());
      pages.set(id, {
        object: 'page',
        id,
        url: `https://www.notion.so/${id.replace(/-/g, '')}`,
        created_time: at,
        last_edited_time: at,
        archived: false,
        properties: {
          '생각 제목': { type: 'title', title: rt(title) },
          '한 줄 생각': { type: 'rich_text', rich_text: rt(oneLine) },
          주제: { type: 'multi_select', multi_select: tags.map((name) => ({ name })) },
          '기록 유형': { type: 'select', select: kind ? { name: kind } : null },
          출처: { type: 'url', url: null },
          활용처: { type: 'multi_select', multi_select: [] },
        },
      });
      children.set(id, []);
      return id;
    },
    rawAppend(pageId, rawBlocks) {
      children.get(pageId).push(...rawBlocks.map((b) => makeBlock(pageId, b)));
      touch(pageId);
    },
    editProps(pageId, props) {
      Object.assign(pages.get(pageId).properties, props);
      touch(pageId);
    },

    async getDatabase(id) {
      calls.push(['getDatabase', id]);
      return {
        id,
        url: 'https://www.notion.so/fake-db',
        title: rt('생각과 자료'),
        properties: {
          주제: { type: 'multi_select', multi_select: { options: schema.tags.map((name) => ({ name })) } },
          '기록 유형': { type: 'select', select: { options: schema.kinds.map((name) => ({ name })) } },
        },
      };
    },
    async queryDatabase(id, body = {}) {
      calls.push(['queryDatabase', id, body]);
      let list = [...pages.values()].filter((p) => !p.archived);
      const f = body.filter?.and || [];
      for (const c of f) {
        if (c.timestamp === 'created_time') list = list.filter((p) => p.created_time >= minute(new Date(c.created_time.on_or_after)));
        if (c.title?.equals !== undefined) list = list.filter((p) => p.properties['생각 제목'].title.map((t) => t.plain_text).join('') === c.title.equals);
        if (c.title?.is_empty) list = list.filter((p) => !p.properties['생각 제목'].title.length);
      }
      list.sort((a, b) => (a.last_edited_time < b.last_edited_time ? 1 : -1));
      const size = body.page_size || 100;
      const start = Number(body.start_cursor || 0);
      const slice = list.slice(start, start + size);
      const more = start + size < list.length;
      return { results: structuredClone(slice), has_more: more, next_cursor: more ? String(start + size) : null };
    },
    async getPage(id) {
      calls.push(['getPage', id]);
      if (!pages.has(id)) throw err(404, 'not found');
      return structuredClone(pages.get(id));
    },
    async createPage(body) {
      calls.push(['createPage', body]);
      const p = body.properties;
      const id = api.seed({
        title: p['생각 제목']?.title?.[0]?.text?.content || '',
        tags: (p['주제']?.multi_select || []).map((o) => o.name),
        kind: p['기록 유형']?.select?.name || null,
      });
      if (body.children?.length) api.rawAppend(id, body.children);
      return structuredClone(pages.get(id));
    },
    async updatePage(id, properties) {
      calls.push(['updatePage', id, properties]);
      const page = pages.get(id);
      for (const [k, v] of Object.entries(properties)) {
        const t = Object.keys(v)[0];
        const val = v[t];
        page.properties[k] = {
          type: t,
          [t]: t === 'title' || t === 'rich_text' ? val.map((x) => ({ ...x, plain_text: x.text.content, annotations: {} })) : val,
        };
      }
      touch(id);
      return structuredClone(page);
    },
    async listChildren(id, cursor, pageSize = 100) {
      calls.push(['listChildren', id]);
      const list = (children.get(id) || []).filter((b) => !b.archived);
      const start = Number(cursor || 0);
      const slice = list.slice(start, start + pageSize);
      const more = start + pageSize < list.length;
      return { results: structuredClone(slice).map(({ parent, ...b }) => b), has_more: more, next_cursor: more ? String(start + pageSize) : null };
    },
    async appendChildren(id, kids, after) {
      calls.push(['appendChildren', id, kids.length, after || null]);
      const list = children.get(id);
      const made = kids.map((b) => makeBlock(id, b));
      if (after) {
        const at = list.findIndex((b) => b.id === after);
        if (at < 0) throw err(400, 'after not found');
        list.splice(at + 1, 0, ...made);
      } else list.push(...made);
      touch(id);
      return { results: structuredClone(made).map(({ parent, ...b }) => b) };
    },
    async updateBlock(id, body) {
      calls.push(['updateBlock', id]);
      const b = blocks.get(id);
      const t = Object.keys(body)[0];
      if (t !== b.type) throw err(400, 'type change');
      const fresh = makeBlock(b.parent, { type: t, [t]: body[t] });
      b[t] = fresh[t];
      blocks.delete(fresh.id);
      touch(b.parent);
      return structuredClone(b);
    },
    async deleteBlock(id) {
      calls.push(['deleteBlock', id]);
      const b = blocks.get(id);
      b.archived = true;
      const list = children.get(b.parent);
      list.splice(list.indexOf(b), 1);
      touch(pageOf(id));
      return {};
    },
    // 테스트용: 페이지 본문 줄
    lines(pageId) {
      return children.get(pageId).map((b) => {
        const d = b[b.type];
        const text = (d.rich_text || []).map((t) => t.plain_text).join('');
        return b.type === 'divider' ? '---' : `${b.type}:${text}`;
      });
    },
  };
  return api;
}

// 체험 모드용 예시 메모
export function seedDemo(fake) {
  const now = Date.now();
  const ago = (h) => new Date(now - h * 3600000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
  fake.seed({
    title: '탐색 중일 때 하루에 하나씩 나아가는 법',
    oneLine: '회사에선 성과가 대신 걸러주던 걸, 탐색기엔 매일 아침 내가 정해야 한다.',
    tags: ['일과 전환'],
    kind: '경험·회고',
    created: ago(2),
  });
  const a = fake.seed({ title: '자격은 하고 싶은 마음이면 충분하다', tags: ['일과 전환', '창작'], kind: '질문·단상', created: ago(30) });
  fake.rawAppend(a, [
    { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '자격이 필요 없는 일에도 자격을 따지고, 자격이 없는 것 같으니 준비만 한다.' } }] } },
    { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '해봐야 뭘 준비할지 알게 된다.' } }] } },
  ]);
  const b = fake.seed({ title: '호흡이 짧아질 때 알아차리기', tags: ['명상', '몸과 에너지'], kind: '질문·단상', created: ago(80) });
  fake.rawAppend(b, [
    { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '바쁠수록 숨이 얕아진다. 알아차리는 순간 이미 반쯤 돌아와 있다.' } }] } },
    { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '날숨을 들숨보다 길게' } }] } },
    { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: '어깨 내리기' } }] } },
  ]);
  const c = fake.seed({ title: '유튜브 레퍼런스 영상 모음', oneLine: '선택한 참고 영상 16개와 추가 링크·기존 분석 메모 모음.', tags: ['창작'], kind: '정보·레퍼런스', created: ago(200) });
  fake.rawAppend(c, [
    { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '편집 리듬이 좋은 영상들.' } }] } },
    { type: 'image', image: { type: 'external', external: { url: 'https://example.com/a.png' }, caption: [] } },
  ]);
  fake.seed({ title: '말을 아끼는 다정함', tags: ['관계'], kind: null, created: ago(400) });
  for (const p of fake.pages.values()) p.last_edited_time = p.created_time;
}
