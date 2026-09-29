import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent, suggestFocus, sharedContext, reflectionDraft } from '../js/rules.js';

test('요청을 목적 공간으로 연결한다', () => {
  assert.equal(routeIntent('영어 공부할래').space, 'study');
  assert.equal(routeIntent('일 시작해야 하는데 너무 피곤해').space, 'energy');
  assert.equal(routeIntent('제안서 마감 준비').space, 'focus');
  assert.equal(routeIntent('여행 숙소 알아봐야 함').space, 'life');
  assert.equal(routeIntent('뭔가 알 수 없는 것').space, 'life');
  assert.equal(routeIntent('   '), null);
});

test('에너지가 낮으면 일을 바꾸지 않고 시간만 줄인다', () => {
  assert.equal(suggestFocus(1).minutes, 10);
  assert.equal(suggestFocus(3).minutes, 15);
  assert.equal(suggestFocus(5).minutes, 25);
  assert.equal(suggestFocus(null).minutes, 15);
});

test('감정 메모 원문은 다른 공간에 공유하지 않는다', () => {
  const checkin = { energy: 2, note: '비밀 메모', mood: '우울' };
  for (const space of ['focus', 'study', 'life']) {
    const text = sharedContext(space, { checkin }).map((i) => i.text).join(' ');
    assert.ok(!text.includes('비밀 메모'));
    assert.ok(!text.includes('우울'));
  }
  assert.deepEqual(sharedContext('energy', { checkin }), []);
});

test('회고 초안은 기록을 요약한다', () => {
  const lines = reflectionDraft({
    checkins: [{ energy: 2, factors: ['수면'] }, { energy: 3, factors: ['운동'] }],
    sessions: [{ minutes: 10, task: '제안서', done: true, energyBefore: 2, energyAfter: 3 }],
    parked: [{}],
  });
  assert.deepEqual(lines, [
    '에너지 체크인 2번 (2 → 3)',
    '영향 요인: 수면, 운동',
    '집중 10분: 제안서 — 해냄 · 에너지 +1',
    '맡겨둔 생각 1개',
  ]);
});
