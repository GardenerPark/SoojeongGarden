import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeclaration, SNError } from '../core.js';
import { createService, memoryStore, VersionConflict } from '../service.js';

// 시계를 손으로 돌리는 서비스. 날짜 경계는 Asia/Seoul 기준.
function setup(start = '2026-10-31T00:00:00Z') {
  let now = new Date(start);
  const svc = createService({ store: memoryStore(), clock: () => now });
  return { run: svc.run, at: (iso) => (now = new Date(iso)) };
}

test('말로 한 선언을 이름과 시간으로 나눈다', () => {
  assert.deepEqual(parseDeclaration('필라테스 2시간'), { title: '필라테스', minutes: 120 });
  assert.deepEqual(parseDeclaration('제안서 1장 구조 잡기, 90분'), { title: '제안서 1장 구조 잡기', minutes: 90 });
  assert.deepEqual(parseDeclaration('촬영 1시간 반'), { title: '촬영', minutes: 90 });
  assert.deepEqual(parseDeclaration('편집 1시간 20분'), { title: '편집', minutes: 80 });
  assert.deepEqual(parseDeclaration('deep work 45 min'), { title: 'deep work', minutes: 45 });
  assert.deepEqual(parseDeclaration('아침 루틴'), { title: '아침 루틴', minutes: null });
  assert.deepEqual(parseDeclaration('5 mangoes 사기'), { title: '5 mangoes 사기', minutes: null });
});

test('하루 루프: 모닝페이지 → 오늘의 하나 → 오늘 ⇄ 집중 → 마무리', async () => {
  const { run, at } = setup('2026-10-31T00:00:00Z'); // 서울 09:00
  let v = await run('view');
  assert.equal(v.phase, 'morning');
  assert.equal(v.morningDone, false);

  // 모닝페이지는 줄글 그대로 남는다
  const page = '영상 업로드 이번 주에 꼭.\n세금 서류도 봐야 하고\n필라테스 예약';
  await run('morning', { text: page });
  await run('morning', { text: page, done: true });
  v = await run('view');
  assert.equal(v.morningPage, page);
  assert.equal(v.morningDone, true);

  await run('setOne', { one: '유튜브 영상 업로드', some: ['세금 서류'] });
  v = await run('view');
  assert.equal(v.phase, 'home');
  assert.deepEqual(v.timeline, []);

  // 집중 → 끝 → 오늘로
  at('2026-10-31T00:10:00Z');
  await run('start', { title: '촬영 대본 정리', minutes: 50 });
  v = await run('view');
  assert.equal(v.phase, 'focus');
  assert.equal(v.active.related, true, '기본은 오늘의 하나를 위한 집중');
  assert.equal(v.review, undefined, '집중 중에는 던진 생각 목록을 보내지 않는다');
  await assert.rejects(() => run('start', { title: '메일' }), SNError, '한 번에 하나만');
  const idea = await run('dump', { text: '썸네일 문구 아이디어' });
  assert.equal(idea.state, 'inbox');

  at('2026-10-31T01:00:00Z');
  await run('end', { note: '대본 완성' });
  assert.equal((await run('view')).phase, 'review');
  await run('sort', { id: idea.id, action: 'now' });
  await run('finishReview');
  v = await run('view');
  assert.equal(v.phase, 'home');
  assert.equal(v.candidates[0].text, '썸네일 문구 아이디어');
  assert.equal(v.lastActivityAt, '2026-10-31T01:00:00.000Z');

  // 사이에 한 일은 다음 집중을 시작할 때 남긴다
  at('2026-10-31T03:30:00Z');
  await run('start', { title: '촬영', related: true, between: '필라테스, 점심' });
  at('2026-10-31T04:30:00Z');
  await run('end');
  await run('finishReview');
  v = await run('view');
  assert.deepEqual(
    v.timeline.map((x) => [x.kind, x.title || x.text]),
    [['focus', '촬영 대본 정리'], ['between', '필라테스, 점심'], ['focus', '촬영']],
  );
  assert.equal(v.timeline[1].at, '2026-10-31T01:00:00.000Z', '사이 기록은 직전 집중이 끝난 때부터');

  const s = await run('close');
  assert.equal(s.finishedCount, 2);
  assert.equal(s.relatedCount, 2);
  assert.equal(s.morningPage, page);
  assert.equal((await run('view')).phase, 'closed');
  assert.ok((await run('list', { status: 'archive' })).map((t) => t.text).includes('썸네일 문구 아이디어'));
});

test('날짜별 기록과 하루 기록', async () => {
  const { run, at } = setup('2026-10-31T00:00:00Z');
  await run('morning', { text: '첫날', done: true });
  await run('setOne', { one: '촬영' });
  await run('start', { title: '대본' });
  at('2026-10-31T01:00:00Z');
  await run('end');
  at('2026-11-01T00:00:00Z'); // 다음 날
  await run('setOne', { one: '편집' });
  const days = await run('history');
  assert.deepEqual(days.map((d) => [d.date, d.one, d.finishedCount]), [['2026-11-01', '편집', 0], ['2026-10-31', '촬영', 1]]);
  const first = await run('day', { date: '2026-10-31' });
  assert.equal(first.morningPage, '첫날');
  assert.equal(first.timeline[0].title, '대본');
});

test('오늘 처음부터 다시: 오늘 것만 지우고, 오늘 고른 지난 생각은 보관함으로 되돌린다', async () => {
  const { run, at } = setup('2026-10-31T00:00:00Z');
  await run('setOne', { one: '어제 것' });
  const old = await run('dump', { text: '조명 사기' });
  await run('close');
  at('2026-11-01T00:00:00Z');
  await run('morning', { text: '테스트', done: true });
  await run('setOne', { one: '조명 사기', fromIds: [old.id] });
  await run('start', { title: '테스트 집중' });
  await run('dump', { text: '오늘 던진 생각' });

  await run('reset');
  const v = await run('view');
  assert.equal(v.phase, 'morning');
  assert.equal(v.morningPage, '');
  assert.deepEqual(v.archive.map((t) => t.text), ['조명 사기'], '고른 지난 생각은 보관함으로 돌아온다');
  assert.equal((await run('day', { date: '2026-10-31' })).one, '어제 것', '지난 날은 그대로');
  assert.deepEqual((await run('history')).map((d) => d.date), ['2026-10-31']);
});

test('오늘의 하나 없이는 블록을 시작하지 않고, 썸은 2개까지', async () => {
  const { run } = setup();
  await assert.rejects(() => run('start', { title: '메일' }), /오늘의 하나/);
  await assert.rejects(() => run('setOne', { one: '촬영', some: ['a', 'b', 'c'] }), /2개/);
  await assert.rejects(() => run('setOne', { one: '  ' }), SNError);
});

test('다음 날이 되면 열린 블록은 자동 종료되고 끝낸 수에서 빠진다', async () => {
  const { run, at } = setup('2026-10-31T01:00:00Z'); // 서울 10:00
  await run('setOne', { one: '촬영' });
  await run('start', { declaration: '촬영 2시간', related: true });
  await run('dump', { text: '조명 사기' });
  at('2026-10-31T16:00:00Z'); // 서울 다음 날 01:00
  const v = await run('view');
  assert.equal(v.date, '2026-11-01');
  assert.equal(v.phase, 'morning');
  assert.deepEqual(v.archive.map((t) => t.text), ['조명 사기']);
  assert.equal((await run('day', { date: '2026-10-31' })).finishedCount, 0);
});

test('그사이 다른 곳에서 저장했으면 다시 읽고 한 번 더 한다', async () => {
  const inner = memoryStore();
  let conflicts = 1;
  const store = {
    load: inner.load,
    async save(state, version) {
      if (conflicts-- > 0) {
        // 다른 기기가 먼저 생각 하나를 저장한 상황
        const other = await inner.load();
        other.state.dumps.push({ id: 'x1', text: '폰에서 던진 생각', state: 'morning', date: '2026-10-31', createdAt: '' });
        await inner.save(other.state, other.version);
        throw new VersionConflict();
      }
      return inner.save(state, version);
    },
  };
  const svc = createService({ store, clock: () => new Date('2026-10-31T00:00:00Z') });
  await svc.run('dump', { text: 'Claude가 던진 생각' });
  const texts = (await svc.run('view')).morning.map((t) => t.text);
  assert.deepEqual(texts, ['폰에서 던진 생각', 'Claude가 던진 생각']);
});

test('계속 겹치면 안내 문구로 실패하고, 약한 ETag는 강한 ETag로 바꾼다', async () => {
  const { strongEtag } = await import('../store-blob.js');
  assert.equal(strongEtag('W/"abc"'), '"abc"');
  assert.equal(strongEtag('"abc"'), '"abc"');
  const store = { load: memoryStore().load, save: async () => { throw new VersionConflict(); } };
  const svc = createService({ store, clock: () => new Date('2026-10-31T00:00:00Z') });
  await assert.rejects(() => svc.run('dump', { text: 'x' }), /한 번 더 눌러/);
});
