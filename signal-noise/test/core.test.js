import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeclaration, SNError } from '../core.js';
import { createService, memoryStore } from '../service.js';

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

test('하루 루프: 아침 → 오늘의 하나 → 블록 → 회고 → 마무리', () => {
  const { run } = setup();
  assert.equal(run('view').phase, 'morning');
  const a = run('dump', { text: '유튜브 촬영' });
  run('dump', { text: '필라테스 예약' });
  run('dump', { text: '엄마 생일' });
  assert.equal(run('view').morning.length, 3);

  run('setOne', { one: '유튜브 촬영', some: ['필라테스'], fromIds: [a.id] });
  const v = run('view');
  assert.equal(v.phase, 'next');
  // 고르지 않은 아침 생각은 보관함으로
  assert.deepEqual(run('list', { status: 'archive' }).map((t) => t.text), ['필라테스 예약', '엄마 생일']);

  run('start', { declaration: '촬영 대본 정리 90분', related: true });
  const focus = run('view');
  assert.equal(focus.phase, 'focus');
  assert.equal(focus.active.minutes, 90);
  assert.equal(focus.review, undefined, '집중 중에는 쏟아낸 목록을 보내지 않는다');

  assert.throws(() => run('start', { declaration: '메일 10분' }), SNError, '한 번에 하나만');
  const idea = run('dump', { text: '썸네일 문구 아이디어' });
  assert.equal(idea.state, 'inbox');

  const ended = run('end', { note: '대본 완성' });
  assert.equal(ended.review.length, 1);
  assert.equal(run('view').phase, 'review');
  run('sort', { id: idea.id, action: 'now' });
  run('finishReview');
  const next = run('view');
  assert.equal(next.phase, 'next');
  assert.equal(next.candidates[0].text, '썸네일 문구 아이디어');

  run('start', { declaration: '필라테스 2시간' }); // 오늘의 하나와 다른 블록
  run('end');
  run('finishReview');
  run('dump', { text: '노트북 수리' });

  const s = run('close');
  assert.equal(s.finishedCount, 2);
  assert.equal(s.relatedCount, 1);
  assert.equal(run('view').phase, 'closed');
  // 남은 것(now 후보, 거르지 않은 것)은 내일 아침 보관함으로
  const archive = run('list', { status: 'archive' }).map((t) => t.text);
  assert.ok(archive.includes('썸네일 문구 아이디어'));
  assert.ok(archive.includes('노트북 수리'));
});

test('오늘의 하나 없이는 블록을 시작하지 않고, 썸은 2개까지', () => {
  const { run } = setup();
  assert.throws(() => run('start', { declaration: '메일 10분' }), /오늘의 하나/);
  assert.throws(() => run('setOne', { one: '촬영', some: ['a', 'b', 'c'] }), /2개/);
  assert.throws(() => run('setOne', { one: '  ' }), SNError);
});

test('다음 날이 되면 열린 블록은 자동 종료되고 끝낸 수에서 빠진다', () => {
  const { run, at } = setup('2026-10-31T01:00:00Z'); // 서울 10:00
  run('setOne', { one: '촬영' });
  run('start', { declaration: '촬영 2시간', related: true });
  run('dump', { text: '조명 사기' });
  at('2026-10-31T16:00:00Z'); // 서울 다음 날 01:00
  const v = run('view');
  assert.equal(v.date, '2026-11-01');
  assert.equal(v.phase, 'morning');
  assert.deepEqual(v.archive.map((t) => t.text), ['조명 사기']);
  assert.equal(run('day', { date: '2026-10-31' }).finishedCount, 0);
});
