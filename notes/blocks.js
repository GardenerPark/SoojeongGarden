// 노션 블록 ↔ 앱 본문(줄 단위 글).
// 앱이 안전하게 고칠 수 있는 블록만 "단순" 블록으로 본다: 서식·링크·멘션이 없는 문단, 제목, 목록, 할 일, 인용, 구분선.
// 단순하지 않은 블록이 하나라도 있으면 그 메모의 본문은 앱에서 고치지 않는다(원본 보기 + 이어 쓰기만).

const PREFIX = {
  heading_1: '# ',
  heading_2: '## ',
  heading_3: '### ',
  bulleted_list_item: '- ',
  numbered_list_item: '1. ',
  quote: '> ',
};
const TEXT_TYPES = new Set(['paragraph', 'to_do', ...Object.keys(PREFIX)]);
const LABEL = {
  image: '[이미지]',
  video: '[영상]',
  file: '[파일]',
  pdf: '[PDF]',
  audio: '[오디오]',
  table: '[표]',
  bookmark: '[링크]',
  embed: '[임베드]',
  link_preview: '[링크]',
  child_page: '[하위 페이지]',
  child_database: '[하위 데이터베이스]',
  column_list: '[여러 단]',
  synced_block: '[동기화 블록]',
  equation: '[수식]',
  code: '[코드]',
  table_of_contents: '[목차]',
  breadcrumb: '[경로]',
  link_to_page: '[페이지 링크]',
};

export const richText = (rt = []) => rt.map((t) => t.plain_text ?? t.text?.content ?? '').join('');

const plainAnnotations = (a) =>
  !a || (!a.bold && !a.italic && !a.strikethrough && !a.underline && !a.code && (a.color || 'default') === 'default');
const plainRichText = (rt = []) => rt.every((t) => t.type === 'text' && !t.text?.link && !t.href && plainAnnotations(t.annotations));

// 한 줄을 어떤 블록으로 읽는지. 앱에서 쓴 글도, 노션 블록을 줄로 바꾼 것도 이 규칙으로 되돌린다.
export function parseLine(line) {
  if (line === '---') return { type: 'divider' };
  let m = line.match(/^\[( |x)\] (.*)$/s);
  if (m) return { type: 'to_do', text: m[2], checked: m[1] === 'x' };
  m = line.match(/^(#{1,3}) (.*)$/s);
  if (m) return { type: `heading_${m[1].length}`, text: m[2] };
  m = line.match(/^[-*•] (.*)$/s);
  if (m) return { type: 'bulleted_list_item', text: m[1] };
  m = line.match(/^\d+[.)] (.*)$/s);
  if (m) return { type: 'numbered_list_item', text: m[1] };
  m = line.match(/^> (.*)$/s);
  if (m) return { type: 'quote', text: m[1] };
  return { type: 'paragraph', text: line };
}

// 노션 블록 하나 → { id, type, line, simple }. simple이 아니면 line은 보여주기용 근사치.
export function blockToLine(b) {
  const type = b.type;
  const data = b[type] || {};
  const base = { id: b.id, type };
  if (type === 'divider') return { ...base, line: '---', simple: !b.has_children };
  if (!TEXT_TYPES.has(type)) {
    const caption = richText(data.caption);
    const url = data.url || data.external?.url || '';
    return { ...base, line: [LABEL[type] || `[${type}]`, caption || (type === 'bookmark' ? url : '')].filter(Boolean).join(' '), simple: false };
  }
  const text = richText(data.rich_text);
  const line = type === 'to_do' ? `[${data.checked ? 'x' : ' '}] ${text}` : (PREFIX[type] || '') + text;
  const back = parseLine(line);
  const simple =
    !b.has_children &&
    !data.is_toggleable &&
    (data.color || 'default') === 'default' &&
    plainRichText(data.rich_text) &&
    !text.includes('\n') &&
    back.type === type && // "- 로 시작하는 문단"처럼 되돌리면 다른 블록이 되는 줄은 고치지 않는다
    (back.text ?? '') === text;
  return { ...base, line: b.has_children ? `${line} [하위 내용 있음]` : line, simple };
}

const chunks = (text) => {
  const out = [];
  for (let i = 0; i < text.length; i += 2000) out.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  return out;
};

// 한 줄 → 노션 블록 생성 객체.
export function lineToBlock(line) {
  const p = parseLine(line);
  if (p.type === 'divider') return { object: 'block', type: 'divider', divider: {} };
  const data = { rich_text: chunks(p.text) };
  if (p.type === 'to_do') data.checked = p.checked;
  return { object: 'block', type: p.type, [p.type]: data };
}

// 같은 종류의 블록 내용만 바꾸는 PATCH 본문.
export function lineToUpdate(line) {
  const b = lineToBlock(line);
  return { [b.type]: b[b.type] };
}

// 본문 글 정리: 줄바꿈 통일, 끝의 빈 줄 제거.
export function normalizeBody(text = '') {
  return String(text).replace(/\r\n?/g, '\n').replace(/[\s ]+$/, '');
}
export const toLines = (text) => {
  const t = normalizeBody(text);
  return t === '' ? [] : t.split('\n');
};

// 기존 블록(줄)과 새 줄의 차이를 최소 작업으로. LCS로 맞춘 뒤, 사이 구간은 같은 종류끼리 내용만 고친다.
// 결과: { deletes: [id], items: [{keep:id} | {update:id, line} | {insert: line}] } — items가 최종 순서.
export function planBody(old, next) {
  const n = old.length;
  const m = next.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = old[i].line === next[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const deletes = [];
  const items = [];
  let dels = [];
  let ins = [];
  const flush = () => {
    let k = 0;
    for (; k < Math.min(dels.length, ins.length); k++) {
      if (dels[k].type === parseLine(ins[k]).type && dels[k].type !== 'divider') items.push({ update: dels[k].id, line: ins[k] });
      else {
        deletes.push(dels[k].id);
        items.push({ insert: ins[k] });
      }
    }
    for (const d of dels.slice(k)) deletes.push(d.id);
    for (const l of ins.slice(k)) items.push({ insert: l });
    dels = [];
    ins = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && old[i].line === next[j]) {
      flush();
      items.push({ keep: old[i].id });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) ins.push(next[j++]);
    else dels.push(old[i++]);
  }
  flush();
  return { deletes, items };
}

// 이어 쓰기 표시. "↳ 2026.11.01 14:30" 한 줄 뒤에 덧붙인 글이 온다.
const MARK = /^↳ (\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})$/;

export function appendMark(date, timeZone = 'Asia/Seoul') {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `↳ ${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

// 본문 줄에서 마지막 이어 쓴 시각(서울 기준 → ISO). 없으면 null.
export function lastAppended(lines, offset = '+09:00') {
  for (let k = lines.length - 1; k >= 0; k--) {
    const m = lines[k].match(MARK);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${offset}`;
  }
  return null;
}
