import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Conflict, NotesError, createService } from '../service.js';
import { createFakeNotion } from '../fake-notion.js';

const p = (s) => ({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: s } }] } });

function setup() {
  let now = new Date('2026-11-01T05:00:00Z');
  const fake = createFakeNotion({ clock: () => now });
  const svc = createService({ notion: fake, dbId: fake.dbId, clock: () => now });
  return { fake, run: svc.run, tick: (min) => (now = new Date(now.getTime() + min * 60000)) };
}
const asBase = (s) => ({ title: s.title, body: s.body, tags: s.tags, kind: s.kind });

test('목록은 최근 수정 순이고, 한 줄 생각이 없으면 본문 앞부분을 미리보기로 준다', async () => {
  const { fake, run, tick } = setup();
  const a = fake.seed({ title: '오래된', oneLine: '한 줄' });
  tick(5);
  const b = fake.seed({ title: '새것' });
  fake.rawAppend(b, [p('본문 첫 줄'), p('둘째 줄')]);
  const { memos } = await run('list');
  assert.deepEqual(memos.map((m) => m.title), ['새것', '오래된']);
  assert.equal(memos[0].snippet, '본문 첫 줄 둘째 줄');
  assert.equal(memos[1].oneLine, '한 줄');
  assert.equal(memos[1].id, a);
});

test('새 메모를 만들고, 같은 내용을 다시 보내도 하나만 생긴다', async () => {
  const { fake, run } = setup();
  const next = { title: '떠오른 생각', body: '첫 줄\n- 목록', tags: ['명상'], kind: null };
  const m = await run('create', { next });
  assert.equal(m.title, '떠오른 생각');
  assert.equal(m.body, '첫 줄\n- 목록');
  assert.deepEqual(m.tags, ['명상']);
  const again = await run('create', { next });
  assert.equal(again.id, m.id);
  assert.equal(fake.pages.size, 1);
  await assert.rejects(run('create', { next: { title: '', body: '' } }), NotesError);
  await assert.rejects(run('create', { next: { title: 'x', tags: ['없는태그'] } }), /노션에 없는 태그/);
});

test('본문을 고치면 바뀐 블록만 고친다', async () => {
  const { fake, run } = setup();
  const id = fake.seed({ title: 't' });
  fake.rawAppend(id, [p('하나'), p('둘'), p('셋')]);
  const s = await run('get', { id });
  assert.equal(s.editable, true);
  fake.calls.length = 0;
  const after = await run('save', { id, base: asBase(s), next: { ...asBase(s), body: '하나\n둘 고침\n셋\n넷' } });
  assert.equal(after.body, '하나\n둘 고침\n셋\n넷');
  const writes = fake.calls.filter(([op]) => ['updateBlock', 'appendChildren', 'deleteBlock'].includes(op)).map(([op]) => op);
  assert.deepEqual(writes, ['updateBlock', 'appendChildren']);
  // 맨 앞에 끼워 넣기 (API가 못 해서 다시 쓰지만 내용은 같다)
  const front = await run('save', { id, base: asBase(after), next: { ...asBase(after), body: '영\n하나\n둘 고침\n셋\n넷' } });
  assert.equal(front.body, '영\n하나\n둘 고침\n셋\n넷');
  assert.deepEqual(fake.lines(id), ['paragraph:영', 'paragraph:하나', 'paragraph:둘 고침', 'paragraph:셋', 'paragraph:넷']);
});

test('양쪽에서 같은 메모를 다르게 고치면 덮어쓰지 않고 충돌로 알린다', async () => {
  const { fake, run } = setup();
  const id = fake.seed({ title: '원래 제목', tags: ['관계'] });
  fake.rawAppend(id, [p('원래 본문')]);
  const base = asBase(await run('get', { id }));
  // 노션에서 본문을 고침
  fake.rawAppend(id, [p('노션에서 덧붙임')]);
  const err = await run('save', { id, base, next: { ...base, body: '앱에서 고침' } }).catch((e) => e);
  assert.ok(err instanceof Conflict);
  assert.deepEqual(err.fields, ['body']);
  assert.equal(err.remote.body, '원래 본문\n노션에서 덧붙임');
  assert.deepEqual(fake.lines(id), ['paragraph:원래 본문', 'paragraph:노션에서 덧붙임']);
  // 내가 고치지 않은 칸(본문)을 노션이 고쳤으면 제목만 바꾸고 본문은 노션 것 유지
  const ok = await run('save', { id, base, next: { ...base, title: '새 제목' } });
  assert.equal(ok.title, '새 제목');
  assert.equal(ok.body, '원래 본문\n노션에서 덧붙임');
  // 확인한 뒤 내 글로 저장(force)
  const forced = await run('save', { id, base, next: { ...base, body: '앱에서 고침' }, force: true });
  assert.equal(forced.body, '앱에서 고침');
});

test('표·이미지가 있는 메모는 본문을 고치지 않지만 이어 쓰기와 제목은 된다', async () => {
  const { fake, run } = setup();
  const id = fake.seed({ title: '레퍼런스' });
  fake.rawAppend(id, [p('설명'), { type: 'image', image: { type: 'external', external: { url: 'https://e/x.png' }, caption: [] } }]);
  const s = await run('get', { id });
  assert.equal(s.editable, false);
  await assert.rejects(run('save', { id, base: asBase(s), next: { ...asBase(s), body: '바꿈' } }), /노션 원본에서/);
  const t = await run('save', { id, base: asBase(s), next: { ...asBase(s), title: '레퍼런스 모음' } });
  assert.equal(t.title, '레퍼런스 모음');
  const a = await run('append', { id, text: '오늘 다시 보니\n좋다', at: '2026-11-01T05:30:00Z' });
  assert.equal(a.lastAppended, '2026-11-01T14:30:00+09:00');
  assert.deepEqual(fake.lines(id).slice(-3), ['paragraph:↳ 2026.11.01 14:30', 'paragraph:오늘 다시 보니', 'paragraph:좋다']);
  assert.equal(a.blocks.length, 5);
});
