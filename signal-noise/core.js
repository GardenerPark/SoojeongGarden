// Signal & Noise 하루 규칙. 저장 방식과 화면은 모른다: 상태(state)를 받아 바꾸고 결과를 돌려준다.
//  - 오늘의 하나: 아침에 정하는 하루의 기준. 하루에 하나.
//  - 블록: 지금 실제로 하는 일. 한 번에 하나만, 하루에 몇 개든.
//  - 쏟아낸 생각: morning(아침) → inbox(집중 중) → now / kept(보관함) / dropped. 고른 것은 picked.

export const MAX_SOME = 2;
const MAX_TEXT = 2000;

export class SNError extends Error {}

export const emptyState = () => ({ v: 1, seq: 0, days: {}, dumps: [] });

export function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const nextId = (s, prefix) => `${prefix}${(s.seq = (s.seq || 0) + 1)}`;
const iso = (now) => now.toISOString();

function day(s, date) {
  return (s.days[date] ||= { one: null, some: [], blocks: [], reviewing: false, closedAt: null });
}

function cleanText(text, what = '내용') {
  const t = String(text ?? '').trim();
  if (!t) throw new SNError(`${what}을 적어 주세요.`);
  return t.slice(0, MAX_TEXT);
}

const activeBlock = (d) => d.blocks.find((b) => !b.endedAt) || null;

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

// 지난 날짜에 남은 것을 정리한다: 열린 블록은 자동 종료(끝낸 수에서 제외), 거르지 않은 생각은 보관함으로.
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

export function setOne(s, { one, some = [], fromIds = [] }, { date }) {
  const d = day(s, date);
  if (d.closedAt) throw new SNError('오늘은 이미 마무리했어요.');
  const list = (Array.isArray(some) ? some : [some]).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (list.length > MAX_SOME) throw new SNError(`썸은 ${MAX_SOME}개까지 정할 수 있어요.`);
  d.one = cleanText(one, '오늘의 하나');
  d.some = list;
  const picked = new Set(fromIds);
  for (const t of s.dumps) {
    if (picked.has(t.id) && t.state !== 'dropped') t.state = 'picked';
    else if (t.date === date && t.state === 'morning') t.state = 'kept'; // 뽑히지 않은 아침 생각은 보관함으로
  }
  return { one: d.one, some: d.some };
}

export function startBlock(s, { declaration, title, minutes, related = false, fromId }, { now, date }) {
  const d = day(s, date);
  if (d.closedAt) throw new SNError('오늘은 이미 마무리했어요.');
  if (!d.one) throw new SNError('먼저 오늘의 하나를 정해 주세요.');
  const open = activeBlock(d);
  if (open) throw new SNError(`지금 하는 블록이 있어요: ${open.title}. 끝낸 뒤에 다음 하나를 시작해요.`);
  const parsed = declaration ? parseDeclaration(declaration) : { title: '', minutes: null };
  const mins = Number(minutes ?? parsed.minutes) || null;
  const block = {
    id: nextId(s, 'b'),
    title: cleanText(title || parsed.title, '블록 이름'),
    minutes: mins ? Math.min(720, Math.max(1, Math.round(mins))) : null,
    related: Boolean(related),
    startedAt: iso(now),
    endedAt: null,
    note: '',
  };
  d.blocks.push(block);
  d.reviewing = false;
  const from = s.dumps.find((t) => t.id === fromId);
  if (from && from.state !== 'dropped') from.state = 'picked';
  return block;
}

export function endBlock(s, { note } = {}, { now, date }) {
  const d = day(s, date);
  const open = activeBlock(d);
  if (!open) throw new SNError('지금 하는 블록이 없어요.');
  open.endedAt = iso(now);
  if (note != null) open.note = String(note).trim().slice(0, MAX_TEXT);
  d.reviewing = true;
  return { block: open, review: s.dumps.filter((t) => t.state === 'inbox') };
}

export function noteBlock(s, { id, note }, { date }) {
  const d = day(s, date);
  const block = id ? d.blocks.find((b) => b.id === id) : [...d.blocks].reverse().find((b) => b.endedAt);
  if (!block) throw new SNError('메모를 남길 블록을 찾지 못했어요.');
  block.note = String(note ?? '').trim().slice(0, MAX_TEXT);
  return block;
}

const SORT = { now: 'now', keep: 'kept', drop: 'dropped' };

export function sortDump(s, { id, action }) {
  const t = s.dumps.find((x) => x.id === id);
  if (!t) throw new SNError('그 생각을 찾지 못했어요.');
  if (!SORT[action]) throw new SNError('지금 / 보관 / 지우기 중 하나를 골라 주세요.');
  t.state = SORT[action];
  return t;
}

export function finishReview(s, _args, { date }) {
  day(s, date).reviewing = false;
  return { ok: true };
}

export function closeDay(s, _args, ctx) {
  const d = day(s, ctx.date);
  if (d.closedAt) return summary(s, ctx.date);
  const open = activeBlock(d);
  if (open) open.endedAt = iso(ctx.now);
  for (const t of s.dumps) {
    if (['morning', 'inbox', 'now'].includes(t.state)) t.state = 'kept'; // 남은 것은 내일 아침 보관함으로
  }
  d.reviewing = false;
  d.closedAt = iso(ctx.now);
  return summary(s, ctx.date);
}

// 북극성: 끝냈다고 말한 블록의 수. 그중 오늘의 하나를 위한 블록 수를 따로 센다.
export function summary(s, date) {
  const d = s.days[date] || { one: null, some: [], blocks: [], closedAt: null };
  const finished = d.blocks.filter((b) => b.endedAt && !b.auto);
  return {
    date,
    one: d.one,
    some: d.some,
    closed: Boolean(d.closedAt),
    finishedCount: finished.length,
    relatedCount: finished.filter((b) => b.related).length,
    blocks: d.blocks,
    carried: s.dumps.filter((t) => t.state === 'kept' && t.date === date),
  };
}

export function recentBlocks(s, limit = 4) {
  const seen = new Map();
  const all = Object.values(s.days).flatMap((d) => d.blocks).filter((b) => b.endedAt);
  all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const b of all) if (!seen.has(b.title)) seen.set(b.title, { title: b.title, minutes: b.minutes, related: b.related });
  return [...seen.values()].slice(0, limit);
}

// 화면 한 장에 필요한 것만. 집중 중(focus)에는 쏟아낸 목록을 보내지 않는다.
export function view(s, { date }) {
  const d = s.days[date] || day(s, date);
  const active = activeBlock(d);
  const phase = d.closedAt ? 'closed' : !d.one ? 'morning' : active ? 'focus' : d.reviewing ? 'review' : 'next';
  const base = { date, phase, one: d.one, some: d.some, finishedCount: summary(s, date).finishedCount };
  const byState = (st) => s.dumps.filter((t) => t.state === st);
  if (phase === 'morning') return { ...base, morning: byState('morning').filter((t) => t.date === date), archive: byState('kept') };
  if (phase === 'focus') return { ...base, active };
  if (phase === 'review') {
    const last = [...d.blocks].reverse().find((b) => b.endedAt);
    return { ...base, lastBlock: last, review: byState('inbox') };
  }
  if (phase === 'next') return { ...base, candidates: byState('now'), recent: recentBlocks(s), review: byState('inbox').length };
  return { ...base, summary: summary(s, date) };
}

export function listDumps(s, { status = 'review' } = {}) {
  const st = { review: 'inbox', next: 'now', archive: 'kept', morning: 'morning' }[status];
  if (!st) throw new SNError('status는 review / next / archive / morning 중 하나예요.');
  return s.dumps.filter((t) => t.state === st);
}
