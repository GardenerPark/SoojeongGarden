// Signal & Noise 하루 규칙. 저장 방식과 화면은 모른다: 상태(state)를 받아 바꾸고 결과를 돌려준다.
//  - 모닝페이지: 아침에 줄글로 쭉 쓰는 글. 나누지 않고 그대로 남긴다.
//  - 오늘의 하나: 오늘 끝내고 싶은 결과 하나. 썸은 최대 2개.
//  - 집중(블록): 지금 앉아서 하는 행동. 한 번에 하나만, 시작할 때만 기록한다.
//  - 사이에 한 일: 집중과 집중 사이에 한 일. 다음 집중을 시작할 때 한 줄로 남긴다.
//  - 쏟아낸 생각: inbox(집중 중) → now / kept(보관함) / dropped. 고른 것은 picked.
//    오늘의 하나를 정하기 전에 던진 생각은 morning으로 두었다가 고르지 않으면 보관함으로.

export const MAX_SOME = 2;
const MAX_TEXT = 2000;
const MAX_PAGE = 20000;

export class SNError extends Error {}

export const emptyState = () => ({ v: 2, seq: 0, days: {}, dumps: [] });

export function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const nextId = (s, prefix) => `${prefix}${(s.seq = (s.seq || 0) + 1)}`;
const iso = (now) => now.toISOString();

const newDay = () => ({
  morningPage: '',
  morningDone: false,
  one: null,
  some: [],
  oneSetAt: null,
  blocks: [],
  between: [],
  reviewing: false,
  closedAt: null,
});

function day(s, date) {
  const d = (s.days[date] ||= newDay());
  d.between ||= []; // 예전 기록에는 없다
  return d;
}

function cleanText(text, what = '내용', max = MAX_TEXT) {
  const t = String(text ?? '').trim();
  if (!t) throw new SNError(`${what}을 적어 주세요.`);
  return t.slice(0, max);
}

const activeBlock = (d) => d.blocks.find((b) => !b.endedAt) || null;
const notClosed = (d) => {
  if (d.closedAt) throw new SNError('오늘은 이미 마무리했어요.');
};

// "필라테스 2시간", "제안서 1장 구조 잡기, 90분", "촬영 1시간 반" → { title, minutes }
const HALF = /(\d+(?:\.\d+)?)\s*시간\s*반/;
const HOURS = /(\d+(?:\.\d+)?)\s*(?:시간|h(?:ours?|rs?)?(?![a-z]))/i;
const MINS = /(\d+)\s*(?:분|m(?:in(?:ute)?s?)?(?![a-z]))/i;

export function parseDeclaration(text) {
  const raw = String(text ?? '').trim();
  let rest = raw;
  let minutes = 0;
  let m;
  if ((m = rest.match(HALF))) {
    minutes += parseFloat(m[1]) * 60 + 30;
    rest = rest.replace(m[0], ' ');
  } else if ((m = rest.match(HOURS))) {
    minutes += parseFloat(m[1]) * 60;
    rest = rest.replace(m[0], ' ');
  }
  if ((m = rest.match(MINS))) {
    minutes += Number(m[1]);
    rest = rest.replace(m[0], ' ');
  }
  const title = rest
    .replace(/\s(동안|짜리)(?=\s|$)/g, ' ')
    .replace(/["“”]/g, '')
    .replace(/^[\s,·-]+|[\s,·-]+$/g, '')
    .replace(/\s+/g, ' ');
  return { title: title || raw, minutes: minutes ? Math.min(720, Math.round(minutes)) : null };
}

// 지난 날짜에 남은 것을 정리한다: 열린 집중은 자동 종료(끝낸 수에서 제외), 거르지 않은 생각은 보관함으로.
export function rollover(s, { now, date }) {
  for (const [key, d] of Object.entries(s.days)) {
    if (key >= date) continue;
    const open = activeBlock(d);
    if (open) Object.assign(open, { endedAt: iso(now), auto: true });
    d.reviewing = false;
  }
  for (const t of s.dumps) {
    if (t.date < date && ['morning', 'inbox', 'now'].includes(t.state)) t.state = 'kept';
  }
}

// MARK: 아침

export function writeMorning(s, { text, done = false }, { date }) {
  const d = day(s, date);
  notClosed(d);
  if (text != null) d.morningPage = String(text).slice(0, MAX_PAGE);
  if (done) d.morningDone = true;
  return { morningPage: d.morningPage, morningDone: d.morningDone };
}

export function reopenMorning(s, _args, { date }) {
  const d = day(s, date);
  notClosed(d);
  d.morningDone = false;
  return { ok: true };
}

export function setOne(s, { one, some = [], fromIds = [] }, { now, date }) {
  const d = day(s, date);
  notClosed(d);
  const list = (Array.isArray(some) ? some : [some]).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (list.length > MAX_SOME) throw new SNError(`썸은 ${MAX_SOME}개까지 정할 수 있어요.`);
  d.one = cleanText(one, '오늘의 하나');
  d.some = list;
  d.oneSetAt ||= iso(now);
  d.morningDone = true;
  const picked = new Set(fromIds);
  for (const t of s.dumps) {
    if (picked.has(t.id) && t.state !== 'dropped') Object.assign(t, { state: 'picked', pickedOn: date });
    else if (t.date === date && t.state === 'morning') t.state = 'kept'; // 고르지 않은 아침 생각은 보관함으로
  }
  return { one: d.one, some: d.some };
}

// MARK: 쏟아내기

export function addDump(s, { text, source = 'app' }, { now, date }) {
  const d = day(s, date);
  const dump = {
    id: nextId(s, 't'),
    text: cleanText(text, '생각'),
    state: d.one ? 'inbox' : 'morning',
    source,
    date,
    createdAt: iso(now),
  };
  s.dumps.push(dump);
  return dump;
}

const SORT = { now: 'now', keep: 'kept', drop: 'dropped' };

export function sortDump(s, { id, action }) {
  const t = s.dumps.find((x) => x.id === id);
  if (!t) throw new SNError('그 생각을 찾지 못했어요.');
  if (!SORT[action]) throw new SNError('지금 / 보관 / 지우기 중 하나를 골라 주세요.');
  t.state = SORT[action];
  return t;
}

// MARK: 집중

/** 마지막으로 무언가 끝난 때: 마지막 집중이 끝난 때, 사이에 한 일을 남긴 때, 오늘의 하나를 정한 때 중 가장 늦은 것. */
function lastActivityAt(d) {
  const times = [d.oneSetAt, ...d.blocks.map((b) => b.endedAt), ...d.between.map((x) => x.to)].filter(Boolean);
  return times.sort().at(-1) || null;
}

export function startBlock(s, { declaration, title, minutes, related = true, fromId, between }, { now, date }) {
  const d = day(s, date);
  notClosed(d);
  if (!d.one) throw new SNError('먼저 오늘의 하나를 정해 주세요.');
  const open = activeBlock(d);
  if (open) throw new SNError(`지금 집중하는 게 있어요: ${open.title}. 끝낸 뒤에 다음 집중을 시작해요.`);
  const parsed = declaration ? parseDeclaration(declaration) : { title: '', minutes: null };
  const mins = Number(minutes ?? parsed.minutes) || null;
  const block = {
    id: nextId(s, 'b'),
    title: cleanText(title || parsed.title, '집중할 일'),
    minutes: mins ? Math.min(720, Math.max(1, Math.round(mins))) : null,
    related: Boolean(related),
    startedAt: iso(now),
    endedAt: null,
    note: '',
  };
  const gap = String(between ?? '').trim();
  if (gap) d.between.push({ id: nextId(s, 'g'), text: gap.slice(0, MAX_TEXT), from: lastActivityAt(d), to: iso(now) });
  d.blocks.push(block);
  d.reviewing = false;
  const from = s.dumps.find((t) => t.id === fromId);
  if (from && from.state !== 'dropped') Object.assign(from, { state: 'picked', pickedOn: date });
  return block;
}

export function endBlock(s, { note } = {}, { now, date }) {
  const d = day(s, date);
  const open = activeBlock(d);
  if (!open) throw new SNError('지금 집중하는 게 없어요.');
  open.endedAt = iso(now);
  if (note != null) open.note = String(note).trim().slice(0, MAX_TEXT);
  d.reviewing = true;
  return { block: open, review: s.dumps.filter((t) => t.state === 'inbox') };
}

export function noteBlock(s, { id, note }, { date }) {
  const d = day(s, date);
  const block = id ? d.blocks.find((b) => b.id === id) : [...d.blocks].reverse().find((b) => b.endedAt);
  if (!block) throw new SNError('메모를 남길 집중을 찾지 못했어요.');
  block.note = String(note ?? '').trim().slice(0, MAX_TEXT);
  return block;
}

export function finishReview(s, _args, { date }) {
  day(s, date).reviewing = false;
  return { ok: true };
}

// MARK: 하루

export function closeDay(s, _args, ctx) {
  const d = day(s, ctx.date);
  if (d.closedAt) return dayRecord(s, ctx.date);
  const open = activeBlock(d);
  if (open) open.endedAt = iso(ctx.now);
  for (const t of s.dumps) {
    if (['morning', 'inbox', 'now'].includes(t.state)) t.state = 'kept'; // 남은 것은 내일 아침 보관함으로
  }
  d.reviewing = false;
  d.closedAt = iso(ctx.now);
  return dayRecord(s, ctx.date);
}

/** 오늘 적은 것을 모두 지우고 아침부터 다시. 오늘 보관함에서 고른 지난 생각은 보관함으로 되돌린다. */
export function resetDay(s, _args, { date }) {
  delete s.days[date];
  s.dumps = s.dumps.filter((t) => t.date !== date);
  for (const t of s.dumps) {
    if (t.pickedOn === date) {
      t.state = 'kept';
      delete t.pickedOn;
    }
  }
  return { ok: true };
}

/** 집중과 사이에 한 일을 시간순으로. */
export function timeline(d) {
  const focus = d.blocks
    .filter((b) => b.endedAt && !b.auto)
    .map((b) => ({ kind: 'focus', id: b.id, at: b.startedAt, endedAt: b.endedAt, title: b.title, minutes: b.minutes, related: b.related, note: b.note }));
  const gaps = (d.between || []).map((x) => ({ kind: 'between', id: x.id, at: x.from || x.to, to: x.to, text: x.text }));
  return [...focus, ...gaps].sort((a, b) => a.at.localeCompare(b.at));
}

// 북극성: 끝냈다고 말한 집중의 수. 그중 오늘의 하나를 위한 집중 수를 따로 센다.
export function summary(s, date) {
  const d = s.days[date] || newDay();
  const finished = d.blocks.filter((b) => b.endedAt && !b.auto);
  return {
    date,
    one: d.one,
    some: d.some,
    closed: Boolean(d.closedAt),
    finishedCount: finished.length,
    relatedCount: finished.filter((b) => b.related).length,
    blocks: d.blocks,
    timeline: timeline({ ...d, between: d.between || [] }),
    carried: s.dumps.filter((t) => t.state === 'kept' && t.date === date),
  };
}

/** 하루 기록 전체: 요약 + 모닝페이지. */
export function dayRecord(s, date) {
  const d = s.days[date] || newDay();
  return { ...summary(s, date), morningPage: d.morningPage || '' };
}

/** 날짜별 목록 (최근부터). */
export function history(s, { limit = 60 } = {}) {
  return Object.keys(s.days)
    .sort()
    .reverse()
    .slice(0, limit)
    .map((date) => {
      const sm = summary(s, date);
      return { date, one: sm.one, finishedCount: sm.finishedCount, relatedCount: sm.relatedCount, closed: sm.closed };
    });
}

export function recentBlocks(s, limit = 4) {
  const seen = new Map();
  const all = Object.values(s.days).flatMap((d) => d.blocks).filter((b) => b.endedAt && !b.auto);
  all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const b of all) if (!seen.has(b.title)) seen.set(b.title, { title: b.title, minutes: b.minutes, related: b.related });
  return [...seen.values()].slice(0, limit);
}

// 화면 한 장에 필요한 것만. 집중 중(focus)에는 쏟아낸 목록을 보내지 않는다.
//  morning(모닝페이지·오늘의 하나) → home(오늘) ⇄ focus(집중) → review(집중 끝) → home … → closed
export function view(s, { date }) {
  const d = s.days[date] || newDay();
  d.between ||= [];
  const active = activeBlock(d);
  const phase = d.closedAt ? 'closed' : !d.one ? 'morning' : active ? 'focus' : d.reviewing ? 'review' : 'home';
  const base = { date, phase, one: d.one, some: d.some, finishedCount: summary(s, date).finishedCount };
  const byState = (st) => s.dumps.filter((t) => t.state === st);
  if (phase === 'morning') {
    return {
      ...base,
      morningPage: d.morningPage || '',
      morningDone: Boolean(d.morningDone),
      morning: byState('morning').filter((t) => t.date === date),
      archive: byState('kept'),
    };
  }
  if (phase === 'focus') return { ...base, active };
  if (phase === 'review') {
    const last = [...d.blocks].reverse().find((b) => b.endedAt);
    return { ...base, lastBlock: last, review: byState('inbox') };
  }
  if (phase === 'home') {
    return {
      ...base,
      timeline: timeline(d),
      relatedCount: summary(s, date).relatedCount,
      lastActivityAt: lastActivityAt(d),
      candidates: byState('now'),
      recent: recentBlocks(s),
      review: byState('inbox').length,
    };
  }
  return { ...base, summary: dayRecord(s, date) };
}

export function listDumps(s, { status = 'review' } = {}) {
  const st = { review: 'inbox', next: 'now', archive: 'kept', morning: 'morning' }[status];
  if (!st) throw new SNError('status는 review / next / archive / morning 중 하나예요.');
  return s.dumps.filter((t) => t.state === st);
}
