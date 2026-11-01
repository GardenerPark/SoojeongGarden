import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendMark, blockToLine, lastAppended, lineToBlock, parseLine, planBody } from '../blocks.js';

const t = (s, annotations = {}) => [{ type: 'text', text: { content: s, link: null }, plain_text: s, annotations }];
const blk = (type, text, extra = {}) => ({ id: `${type}-${text}`, type, has_children: false, [type]: { rich_text: t(text), color: 'default', ...extra } });

test('단순 블록은 줄로 바꿨다가 그대로 되돌린다', () => {
  for (const [type, text, line] of [
    ['paragraph', '그냥 문단', '그냥 문단'],
    ['heading_2', '소제목', '## 소제목'],
    ['bulleted_list_item', '하나', '- 하나'],
    ['numbered_list_item', '첫째', '1. 첫째'],
    ['quote', '인용', '> 인용'],
    ['paragraph', '', ''],
  ]) {
    const b = blockToLine(blk(type, text));
    assert.equal(b.line, line);
    assert.equal(b.simple, true, type);
    const back = lineToBlock(line);
    assert.equal(back.type, type);
    assert.equal(back[type].rich_text.map((x) => x.text.content).join(''), text);
  }
  assert.deepEqual(parseLine('[x] 끝'), { type: 'to_do', text: '끝', checked: true });
  assert.equal(blockToLine({ id: 'd', type: 'divider', divider: {} }).line, '---');
});

test('서식·링크·하위 블록·이미지·되돌리면 달라지는 문단은 단순하지 않다', () => {
  assert.equal(blockToLine({ ...blk('paragraph', 'x'), paragraph: { rich_text: t('굵게', { bold: true }) } }).simple, false);
  assert.equal(blockToLine({ ...blk('paragraph', 'x'), paragraph: { rich_text: [{ type: 'text', text: { content: 'a', link: { url: 'https://a' } }, plain_text: 'a', href: 'https://a' }] } }).simple, false);
  assert.equal(blockToLine({ ...blk('bulleted_list_item', 'x'), has_children: true }).simple, false);
  assert.equal(blockToLine({ id: 'i', type: 'image', image: { caption: [] } }).simple, false);
  assert.equal(blockToLine(blk('paragraph', '- 목록처럼 보이는 문단')).simple, false);
  assert.equal(blockToLine(blk('paragraph', '줄\n바꿈')).simple, false);
  assert.equal(blockToLine({ ...blk('paragraph', '색'), paragraph: { rich_text: t('색'), color: 'red' } }).simple, false);
});

test('본문 차이는 같은 줄은 두고, 바뀐 줄은 고치고, 새 줄은 끼워 넣는다', () => {
  const old = [
    { id: 'a', type: 'paragraph', line: '하나' },
    { id: 'b', type: 'paragraph', line: '둘' },
    { id: 'c', type: 'bulleted_list_item', line: '- 셋' },
  ];
  assert.deepEqual(planBody(old, ['하나', '둘', '- 셋']), { deletes: [], items: [{ keep: 'a' }, { keep: 'b' }, { keep: 'c' }] });
  assert.deepEqual(planBody(old, ['하나', '둘!', '- 셋', '넷']), {
    deletes: [],
    items: [{ keep: 'a' }, { update: 'b', line: '둘!' }, { keep: 'c' }, { insert: '넷' }],
  });
  // 종류가 바뀌면 지우고 새로
  assert.deepEqual(planBody(old, ['하나', '- 둘', '- 셋']), { deletes: ['b'], items: [{ keep: 'a' }, { insert: '- 둘' }, { keep: 'c' }] });
  assert.deepEqual(planBody(old, ['하나']), { deletes: ['b', 'c'], items: [{ keep: 'a' }] });
});

test('이어 쓰기 표시는 서울 시각으로 쓰고 다시 읽는다', () => {
  const mark = appendMark(new Date('2026-11-01T05:30:00Z'));
  assert.equal(mark, '↳ 2026.11.01 14:30');
  assert.equal(lastAppended(['처음', mark, '덧붙임', '↳ 2026.11.02 09:05', '또']), '2026-11-02T09:05:00+09:00');
  assert.equal(lastAppended(['없음']), null);
});
