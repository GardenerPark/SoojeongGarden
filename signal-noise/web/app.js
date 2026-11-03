// Signal & Noise 웹앱. 서버가 정한 단계(phase)에 맞는 화면 하나만 그린다.
//   morning(모닝페이지 → 오늘의 하나) → home(오늘) ⇄ focus(집중) → review(집중 끝) → home … → closed
//   기록(날짜별 보기)은 어느 단계에서든 열 수 있다.

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const params = new URLSearchParams(location.search);

let token = '';
try {
  if (params.get('token')) localStorage.setItem('sn-token', params.get('token'));
  token = localStorage.getItem('sn-token') || '';
} catch {
  token = params.get('token') || '';
}
if (params.has('token')) {
  params.delete('token');
  history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''));
}

let view = null;
let needToken = false;
const ui = {
  capture: params.has('capture'),
  screen: null, // null(단계 화면) | 'history' | 'day'
  history: null,
  day: null,
  start: null, // null | 'between' | 'what' : 집중 시작 단계
  confirm: null, // null | 'close' | 'reset'
  minutes: null,
  related: true,
  fromId: null,
  betweenTags: [],
  focusId: null,
};
const fields = {}; // 다시 그려도 입력 중인 글이 남도록

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const GAP_MINUTES = 15; // 마지막 활동 뒤 이만큼 지나면 "그 사이에 뭐 했어요?"를 묻는다
const BETWEEN_TAGS = ['이동', '식사', '휴식', '운동', '미팅', '집안일'];
const MINUTE_CHOICES = [25, 50, 90];

// ---------- 서버 ----------
async function api(op, args = {}) {
  const res = await fetch(`/api/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(args),
  });
  if (res.status === 401) {
    needToken = true;
    render();
    throw new Error('토큰이 필요해요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '서버에 연결하지 못했어요.');
  return data.result;
}

async function refresh() {
  try {
    view = await api('view');
    needToken = false;
  } catch (e) {
    if (!needToken) toast(e.message);
  }
  render();
}

async function act(op, args, after) {
  try {
    const result = await api(op, args);
    after?.(result);
    await refresh();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 도우미 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const val = (id) => esc(fields[id] ?? '');
const hhmm = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), 2400);
}

const MIC = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const PLUS = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const mic = (target) => (SR ? `<button type="button" class="round outline" data-action="mic" data-target="${target}" aria-label="말로 적기" aria-pressed="false">${MIC}</button>` : '');

const anchor = () => `<footer class="anchor"><span class="label">오늘의 하나</span><b>${esc(view.one)}</b></footer>`;

function confirmBox(kind) {
  const text = {
    close: ['오늘을 마무리할까요? 거르지 않은 생각은 내일 아침 보관함으로 가요.', '마무리'],
    reset: ['오늘 적은 모닝페이지, 오늘의 하나, 집중, 생각을 모두 지우고 처음부터 다시 할까요? 되돌릴 수 없어요.', '지우고 다시 시작'],
  }[kind];
  return `
    <div class="box">
      <p class="hint">${text[0]}</p>
      <div class="row"><button class="primary" data-action="${kind}">${text[1]}</button><button class="ghost" data-action="cancelConfirm">취소</button></div>
    </div>`;
}

function timelineList(items) {
  if (!items.length) return '';
  return `<ol class="timeline">${items
    .map((x) =>
      x.kind === 'focus'
        ? `<li class="${x.related ? 'rel' : ''}"><time>${hhmm(x.at)}</time><span>${esc(x.title)}<small>${hhmm(x.at)}–${hhmm(x.endedAt)} · ${minutesBetween(x.at, x.endedAt)}분${x.note ? ` · ${esc(x.note)}` : ''}</small></span></li>`
        : `<li class="gap"><time>${hhmm(x.at)}</time><span>사이 · ${esc(x.text)}</span></li>`,
    )
    .join('')}</ol>`;
}

// ---------- 화면: 연결 ----------
function screenToken() {
  return `
    <span class="date">Signal &amp; Noise</span>
    <h1>연결 토큰을 넣어 주세요</h1>
    <p class="hint">서버를 열 때 정한 SN_TOKEN 값이에요. 이 기기에만 저장돼요.</p>
    <form data-form="token" class="stack">
      <label class="label" for="token">토큰</label>
      <input class="field" id="token" type="password" autocomplete="off" value="">
      <button class="primary">연결</button>
    </form>`;
}

// ---------- 화면: 아침 ----------
function screenMorningPage() {
  if (fields.page === undefined) fields.page = view.morningPage;
  return `
    <div class="between"><span class="date">${dateLabel(view.date)} · 모닝페이지</span><button class="link" data-action="history">기록</button></div>
    <h1>머릿속에 있는 걸<br>전부 꺼내 보세요</h1>
    <p class="hint">나누거나 정리하지 않아도 돼요. 떠오르는 대로 쭉 쓰세요. 쓰는 대로 저장돼요.</p>
    <label class="label" for="page">오늘 아침</label>
    <textarea class="field page" id="page" placeholder="오늘 해야 할 것, 걱정되는 것, 하고 싶은 것…">${val('page')}</textarea>
    <span class="hint" id="page-status"></span>
    <div class="grow"></div>
    <div class="row">${mic('page')}<button class="primary" data-action="morningDone">다 썼어요</button></div>`;
}

function screenPick() {
  const options = [...view.morning, ...view.archive];
  const chosen = new Set([fields.one, fields.some1, fields.some2].filter(Boolean));
  const chip = (t) => `<button type="button" class="chip${chosen.has(t.text) ? ' on' : ''}" data-action="fill" data-text="${esc(t.text)}">${esc(t.text)}</button>`;
  return `
    <div class="between"><span class="date">${dateLabel(view.date)}</span><button class="link" data-action="history">기록</button></div>
    <h1>오늘의 하나는?</h1>
    <p class="hint">오늘 이것만 끝내도 괜찮은 하루가 되는 결과 한 가지예요. 무엇을 할지(행동)는 집중을 시작할 때 정해요.</p>
    ${
      view.morningPage
        ? `<details class="pagebox"><summary>오늘 모닝페이지 다시 보기</summary><p>${esc(view.morningPage)}</p></details>`
        : ''
    }
    <div class="stack">
      <label class="label" for="one">오늘의 하나 · 필수</label>
      <input class="field strong" id="one" value="${val('one')}" placeholder="예: 유튜브 영상 업로드">
    </div>
    <div class="stack">
      <label class="label" for="some1">썸 · 하면 좋은 것, 최대 2개</label>
      <input class="field" id="some1" value="${val('some1')}" placeholder="예: 세금 서류 정리">
      <input class="field" id="some2" value="${val('some2')}" aria-label="두 번째 썸">
    </div>
    ${options.length ? `<div class="stack"><span class="label">보관함에서 고르기</span><div class="chips">${options.map(chip).join('')}</div></div>` : ''}
    <div class="grow"></div>
    <button class="primary" data-action="setOne">이걸로 오늘 시작</button>
    <button class="link" data-action="reopenMorning">모닝페이지 이어 쓰기</button>`;
}

// ---------- 화면: 오늘 ----------
function screenHome() {
  const items = view.timeline;
  return `
    <div class="between"><span class="date">${dateLabel(view.date)} · 오늘</span><button class="link" data-action="history">기록</button></div>
    <div class="stack">
      <span class="label">오늘의 하나</span>
      <h1>${esc(view.one)}</h1>
      ${view.some.length ? `<div class="chips">${view.some.map((s) => `<span class="chip">썸 · ${esc(s)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="row"><button class="primary" data-action="startFlow">집중 시작</button><button class="round outline" data-action="capture" aria-label="생각 던지기">${PLUS}</button></div>
    ${view.review ? `<p class="hint">던져 둔 생각 ${view.review}개는 다음 집중을 끝낼 때 걸러요.</p>` : ''}
    <div class="stack">
      <div class="between"><span class="label">오늘 한 일</span><span class="hint">집중 ${view.finishedCount} · 오늘의 하나 ${view.relatedCount}</span></div>
      ${items.length ? timelineList(items) : '<p class="hint">아직 끝낸 집중이 없어요. 앉을 준비가 되면 집중 시작을 눌러요.</p>'}
    </div>
    <div class="grow"></div>
    ${
      ui.confirm
        ? confirmBox(ui.confirm)
        : `<div class="row links"><button class="link" data-action="askClose">하루 마무리</button><button class="link" data-action="askReset">오늘 처음부터 다시</button></div>`
    }`;
}

function screenBetween() {
  const since = view.lastActivityAt;
  return `
    <span class="date">집중 시작 · 1/2</span>
    <h1>그 사이에 뭐 했어요?</h1>
    <p class="hint">${since ? `${hhmm(since)}부터 지금까지.` : ''} 한 줄이면 충분해요. 오늘 기록에 연하게 남아요.</p>
    <div class="chips">${BETWEEN_TAGS.map((t) => `<button type="button" class="chip${ui.betweenTags.includes(t) ? ' on' : ''}" data-action="betweenTag" data-text="${t}">${t}</button>`).join('')}</div>
    <input class="field" id="between" value="${val('between')}" placeholder="직접 적기 (예: 은행 다녀옴)" autocomplete="off">
    <div class="grow"></div>
    <button class="primary" data-action="betweenNext">다음</button>
    <div class="row links"><button class="link" data-action="betweenSkip">건너뛰기</button><button class="link" data-action="cancelStart">취소</button></div>`;
}

function screenWhat() {
  const chips = [
    ...view.candidates.map((t) => ({ text: t.text, fromId: t.id, related: true, kind: '지금 하기로 고른 생각' })),
    ...view.some.map((s) => ({ text: s, related: false, kind: '썸' })),
    ...view.recent.map((b) => ({ text: b.title, minutes: b.minutes, related: b.related, kind: '최근에 집중한 것' })),
  ];
  const groups = [...new Set(chips.map((c) => c.kind))].map(
    (kind) => `
    <div class="stack"><span class="label">${kind}</span><div class="chips">${chips
      .filter((c) => c.kind === kind)
      .map((c) => `<button type="button" class="chip" data-action="pickWhat" data-text="${esc(c.text)}" data-from="${c.fromId || ''}" data-related="${c.related}" data-minutes="${c.minutes || ''}">${esc(c.text)}</button>`)
      .join('')}</div></div>`,
  );
  const minuteChip = (m) =>
    `<button type="button" class="chip${ui.minutes === m ? ' on' : ''}" data-action="minutes" data-m="${m ?? ''}">${m ? `${m}분` : '정하지 않음'}</button>`;
  return `
    <span class="date">집중 시작${ui.askedBetween ? ' · 2/2' : ''}</span>
    <h1>지금 앉아서<br>무엇을 할까요?</h1>
    <form data-form="start" class="stack">
      <label class="label" for="what">할 일</label>
      <input class="field strong" id="what" value="${val('what')}" placeholder="예: 촬영 대본 정리" autocomplete="off">
    </form>
    <div class="stack">
      <span class="label">얼마나</span>
      <div class="chips">${[...MINUTE_CHOICES, null].map(minuteChip).join('')}</div>
    </div>
    <label class="check"><input type="checkbox" id="related" ${ui.related ? 'checked' : ''}> 오늘의 하나를 위한 집중</label>
    ${groups.join('')}
    <div class="grow"></div>
    <button class="primary" data-action="start">시작</button>
    <button class="link" data-action="cancelStart">취소</button>
    ${anchor()}`;
}

// ---------- 화면: 집중 ----------
function screenFocus() {
  const b = view.active;
  return `
    <span class="date">집중 · ${hhmm(b.startedAt)} 시작</span>
    <div class="focus-main">
      <span class="tag${b.related ? '' : ' other'}">${b.related ? '오늘의 하나를 위한 집중' : '다른 일에 집중'}</span>
      <h1 class="big">${esc(b.title)}</h1>
      <div class="timer" id="timer">00:00</div>
      ${b.minutes ? '<div class="bar"><i id="bar" style="width:0%"></i></div>' : ''}
      <span class="hint" id="timer-note"></span>
    </div>
    <div class="row"><button class="primary" data-action="end">끝냈어요</button><button class="round" data-action="capture" aria-label="생각 던지기">${PLUS}</button></div>
    ${anchor()}`;
}

function screenReview() {
  const b = view.lastBlock;
  const t = view.review[0];
  return `
    <span class="date">집중 끝 · ${hhmm(b.startedAt)}–${hhmm(b.endedAt)}</span>
    <h1>${esc(b.title)}</h1>
    <div class="stack">
      <label class="label" for="note">어디까지 했나요</label>
      <input class="field" id="note" data-note="${b.id}" value="${esc(fields.note ?? b.note)}" placeholder="예: 구조 완성, 숫자는 다음에">
    </div>
    ${
      t
        ? `<div class="between"><span class="label">집중하며 던진 생각 · 기준은 오늘의 하나</span><span class="hint">${view.review.length}개 남음</span></div>
           <div class="card">
             <p>${esc(t.text)}</p>
             <div class="tri">
               <button data-action="sort" data-id="${t.id}" data-a="now">지금</button>
               <button data-action="sort" data-id="${t.id}" data-a="keep">보관</button>
               <button data-action="sort" data-id="${t.id}" data-a="drop">지우기</button>
             </div>
           </div>`
        : ''
    }
    <div class="grow"></div>
    <button class="primary" data-action="finishReview">오늘로 돌아가기</button>
    ${anchor()}`;
}

// ---------- 화면: 마무리 ----------
function screenClosed() {
  const s = view.summary;
  return `
    <div class="between"><span class="date">${dateLabel(view.date)} · 마무리</span><button class="link" data-action="history">기록</button></div>
    <div class="stack">
      <div class="count"><b>${s.finishedCount}</b><span>개의 집중을 끝냈어요</span></div>
      ${s.one ? `<p class="hint">그중 <b>${s.relatedCount}개</b>가 오늘의 하나, ${esc(s.one)}를 위한 것</p>` : ''}
    </div>
    ${timelineList(s.timeline)}
    ${s.timeline.length ? '<div class="legend"><span class="rel">오늘의 하나를 위한 집중</span><span>다른 집중 · 사이에 한 일</span></div>' : ''}
    <div class="grow"></div>
    ${
      s.carried.length
        ? `<div class="box"><span class="label">내일 아침 보관함으로 · ${s.carried.length}개</span><div class="chips">${s.carried.map((t) => `<span class="chip">${esc(t.text)}</span>`).join('')}</div></div>`
        : ''
    }
    <p class="hint">내일 아침에 다시 만나요.</p>
    ${ui.confirm === 'reset' ? confirmBox('reset') : '<button class="link" data-action="askReset">오늘 처음부터 다시</button>'}`;
}

// ---------- 화면: 기록 ----------
function screenHistory() {
  const days = ui.history;
  return `
    <div class="between"><button class="link back" data-action="back">← 오늘</button><span class="date">기록</span></div>
    <h1>날짜별 기록</h1>
    ${
      !days
        ? '<p class="hint">불러오는 중…</p>'
        : !days.length
          ? '<p class="hint">아직 기록이 없어요.</p>'
          : `<ul class="days">${days
              .map(
                (d) => `<li><button class="dayrow" data-action="openDay" data-date="${d.date}">
                  <span class="date">${shortDate(d.date)}${d.date === view.date ? ' · 오늘' : ''}</span>
                  <b>${esc(d.one || '오늘의 하나를 정하지 않음')}</b>
                  <span class="hint">집중 ${d.finishedCount} · 오늘의 하나 ${d.relatedCount}${d.closed ? ' · 마무리함' : ''}</span>
                </button></li>`,
              )
              .join('')}</ul>`
    }`;
}

function screenDay() {
  const d = ui.day;
  if (!d) return '<p class="hint">불러오는 중…</p>';
  return `
    <div class="between"><button class="link back" data-action="history">← 기록</button><span class="date">${dateLabel(d.date)}</span></div>
    <div class="stack">
      <span class="label">오늘의 하나</span>
      <h1>${esc(d.one || '정하지 않음')}</h1>
      ${d.some.length ? `<div class="chips">${d.some.map((s) => `<span class="chip">썸 · ${esc(s)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="stack">
      <span class="label">모닝페이지</span>
      ${d.morningPage ? `<p class="pagetext">${esc(d.morningPage)}</p>` : '<p class="hint">쓰지 않았어요.</p>'}
    </div>
    <div class="stack">
      <div class="between"><span class="label">한 일</span><span class="hint">집중 ${d.finishedCount} · 오늘의 하나 ${d.relatedCount}</span></div>
      ${d.timeline.length ? timelineList(d.timeline) : '<p class="hint">끝낸 집중이 없어요.</p>'}
    </div>
    ${
      d.carried.length
        ? `<div class="stack"><span class="label">보관함으로 넘긴 생각</span><div class="chips">${d.carried.map((t) => `<span class="chip">${esc(t.text)}</span>`).join('')}</div></div>`
        : ''
    }`;
}

// ---------- 쏟아내기 시트 ----------
function sheet() {
  return `
    <div class="backdrop" data-action="closeCapture"></div>
    <form class="sheet" data-form="capture" aria-label="생각 던지기">
      <div class="grab"></div>
      <label class="label" for="cap">떠오른 생각을 던지세요</label>
      <textarea class="field" id="cap" data-enter rows="3">${val('cap')}</textarea>
      <div class="row"><button class="primary">던지기</button>${mic('cap')}</div>
      <p class="hint">던지면 바로 돌아가요. 분류는 집중이 끝날 때 해요.</p>
    </form>`;
}

function render() {
  if (needToken) {
    $app.innerHTML = screenToken();
    return;
  }
  if (!view) return;
  const p = view.phase;
  let body;
  if (ui.screen === 'history') body = screenHistory();
  else if (ui.screen === 'day') body = screenDay();
  else if (p === 'morning') body = view.morningDone ? screenPick() : screenMorningPage();
  else if (p === 'home') body = ui.start === 'between' ? screenBetween() : ui.start === 'what' ? screenWhat() : screenHome();
  else if (p === 'focus') body = screenFocus();
  else if (p === 'review') body = screenReview();
  else body = screenClosed();
  const canCapture = !ui.screen && (p === 'focus' || p === 'home' || p === 'review');
  $app.innerHTML = body + (ui.capture && canCapture ? sheet() : '');
  if (ui.capture && canCapture) ui.focusId = 'cap';
  if (ui.focusId) {
    document.getElementById(ui.focusId)?.focus();
    ui.focusId = null;
  }
  tick();
}

// 집중 타이머: 전체를 다시 그리지 않고 숫자만 바꾼다.
function tick() {
  if (view?.phase !== 'focus' || ui.screen) return;
  const b = view.active;
  const sec = Math.max(0, Math.floor((Date.now() - new Date(b.startedAt)) / 1000));
  const $t = document.getElementById('timer');
  if (!$t) return;
  const note = document.getElementById('timer-note');
  if (b.minutes) {
    const total = b.minutes * 60;
    $t.textContent = sec <= total ? mmss(total - sec) : `+${mmss(sec - total)}`;
    document.getElementById('bar').style.width = `${Math.min(100, (sec / total) * 100)}%`;
    note.textContent = sec <= total ? `${b.minutes}분 중 ${Math.floor(sec / 60)}분 · 지금은 이것만` : `예정한 ${b.minutes}분이 지났어요. 끝났으면 끝냈어요를 눌러요.`;
  } else {
    $t.textContent = mmss(sec);
    note.textContent = '끝났다고 할 때까지 열어 둘게요.';
  }
}
setInterval(tick, 1000);

// ---------- 모닝페이지 자동 저장 ----------
let pageTimer;
function savePageSoon() {
  clearTimeout(pageTimer);
  const status = document.getElementById('page-status');
  if (status) status.textContent = '쓰는 중…';
  pageTimer = setTimeout(savePage, 800);
}
async function savePage(done = false) {
  clearTimeout(pageTimer);
  try {
    await api('morning', { text: fields.page ?? '', done });
    const status = document.getElementById('page-status');
    if (status) status.textContent = '저장됨';
  } catch (e) {
    toast(e.message);
    throw e;
  }
}

// ---------- 집중 시작 흐름 ----------
function startFlow() {
  const last = view.lastActivityAt;
  const gap = last ? (Date.now() - new Date(last)) / 60000 : 0;
  ui.betweenTags = [];
  fields.between = '';
  ui.askedBetween = gap >= GAP_MINUTES;
  ui.start = ui.askedBetween ? 'between' : 'what';
  ui.focusId = ui.start === 'what' ? 'what' : null;
  render();
}

function betweenText() {
  return [ui.betweenTags.join(', '), (fields.between || '').trim()].filter(Boolean).join(' · ');
}

function startFocus() {
  const title = (fields.what || '').trim();
  if (!title) return toast('무엇을 할지 적어 주세요.');
  act('start', { title, minutes: ui.minutes, related: ui.related, fromId: ui.fromId || undefined, between: ui.between || undefined }, () => {
    fields.what = '';
    Object.assign(ui, { start: null, fromId: null, related: true, minutes: null, between: '', betweenTags: [] });
  });
}

function fill(text) {
  for (const id of ['one', 'some1', 'some2']) {
    if ((fields[id] || '') === text) {
      fields[id] = '';
      return render();
    }
  }
  const slot = ['one', 'some1', 'some2'].find((id) => !(fields[id] || '').trim());
  if (!slot) return toast('오늘의 하나 1개와 썸 2개까지 고를 수 있어요.');
  fields[slot] = text;
  render();
}

async function openHistory() {
  ui.screen = 'history';
  ui.history = null;
  render();
  try {
    ui.history = await api('history');
  } catch (e) {
    toast(e.message);
    ui.history = [];
  }
  if (ui.screen === 'history') render();
}

async function openDay(date) {
  ui.screen = 'day';
  ui.day = null;
  render();
  try {
    ui.day = await api('day', { date });
  } catch (e) {
    toast(e.message);
    ui.screen = 'history';
  }
  render();
}

// ---------- 이벤트 ----------
$app.addEventListener('input', (e) => {
  if (e.target.id) fields[e.target.id] = e.target.value;
  if (e.target.id === 'related') ui.related = e.target.checked;
  if (e.target.id === 'page') savePageSoon();
});

$app.addEventListener('change', (e) => {
  if (e.target.id === 'related') ui.related = e.target.checked;
  if (e.target.dataset.note) api('note', { id: e.target.dataset.note, note: e.target.value }).catch((err) => toast(err.message));
});

$app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.matches('textarea[data-enter]')) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});

$app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.dataset.form;
  if (form === 'token') {
    token = document.getElementById('token').value.trim();
    try {
      localStorage.setItem('sn-token', token);
    } catch {}
    return refresh();
  }
  if (form === 'capture') {
    const text = (fields.cap || '').trim();
    if (!text) return;
    await act('dump', { text }, () => {
      fields.cap = '';
      ui.capture = false;
      toast('던졌어요');
    });
  }
  if (form === 'start') startFocus();
});

// 말하는 동안 인식된 글자를 입력창에 바로 넣는다. 다시 누르면 멈춘다.
let rec = null;
const setMic = (on) =>
  document.querySelectorAll('[data-action="mic"]').forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? '듣기 멈추기' : '말로 적기');
  });

function listen(target) {
  if (rec) return rec.stop();
  const base = (fields[target] || '').replace(/\s+$/, '');
  const sep = target === 'page' && base ? '\n' : ' ';
  rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (ev) => {
    let said = '';
    for (const r of ev.results) said += r[0].transcript;
    fields[target] = [base, said.trim()].filter(Boolean).join(sep);
    const el = document.getElementById(target);
    if (el) el.value = fields[target];
    if (target === 'page') savePageSoon();
  };
  rec.onerror = (ev) => {
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;
    toast(
      ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
        ? '마이크를 쓸 수 없어요. 설정 → Safari → 마이크에서 허용하거나, 키보드의 받아쓰기를 써 주세요.'
        : '음성을 알아듣지 못했어요. 키보드의 받아쓰기도 쓸 수 있어요.',
    );
  };
  rec.onend = () => {
    rec = null;
    setMic(false);
    document.getElementById(target)?.focus();
  };
  try {
    rec.start();
    setMic(true);
  } catch {
    rec = null;
    toast('음성 인식을 시작하지 못했어요. 키보드의 받아쓰기를 써 주세요.');
  }
}

$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case 'morningDone':
      if (rec) rec.stop();
      try {
        await savePage(true);
      } catch {
        return;
      }
      fields.page = undefined;
      return refresh();
    case 'reopenMorning':
      return act('reopenMorning', {});
    case 'fill':
      return fill(el.dataset.text);
    case 'setOne': {
      const one = (fields.one || '').trim();
      if (!one) return toast('오늘의 하나를 적거나 골라 주세요.');
      const some = [fields.some1, fields.some2].map((s) => (s || '').trim()).filter(Boolean);
      const chosen = new Set([one, ...some]);
      const fromIds = [...view.morning, ...view.archive].filter((t) => chosen.has(t.text)).map((t) => t.id);
      return act('setOne', { one, some, fromIds }, () => {
        for (const k of ['one', 'some1', 'some2']) fields[k] = '';
      });
    }
    case 'startFlow':
      return startFlow();
    case 'betweenTag': {
      const t = el.dataset.text;
      ui.betweenTags = ui.betweenTags.includes(t) ? ui.betweenTags.filter((x) => x !== t) : [...ui.betweenTags, t];
      return render();
    }
    case 'betweenNext':
      ui.between = betweenText();
      ui.start = 'what';
      ui.focusId = 'what';
      return render();
    case 'betweenSkip':
      ui.between = '';
      ui.start = 'what';
      ui.focusId = 'what';
      return render();
    case 'cancelStart':
      Object.assign(ui, { start: null, fromId: null, between: '' });
      return render();
    case 'pickWhat':
      fields.what = el.dataset.text;
      ui.fromId = el.dataset.from || null;
      ui.related = el.dataset.related === 'true';
      if (el.dataset.minutes) ui.minutes = Number(el.dataset.minutes);
      ui.focusId = 'what';
      return render();
    case 'minutes':
      ui.minutes = el.dataset.m ? Number(el.dataset.m) : null;
      return render();
    case 'start':
      return startFocus();
    case 'end':
      fields.note = undefined;
      return act('end', {});
    case 'sort':
      return act('sort', { id: el.dataset.id, action: el.dataset.a });
    case 'finishReview': {
      const note = document.getElementById('note');
      try {
        if (note && note.value !== view.lastBlock.note) await api('note', { id: view.lastBlock.id, note: note.value });
      } catch (err) {
        return toast(err.message);
      }
      return act('finishReview', {}, () => (fields.note = undefined));
    }
    case 'capture':
      ui.capture = true;
      return render();
    case 'closeCapture':
      ui.capture = false;
      return render();
    case 'askClose':
      ui.confirm = 'close';
      return render();
    case 'askReset':
      ui.confirm = 'reset';
      return render();
    case 'cancelConfirm':
      ui.confirm = null;
      return render();
    case 'close':
      return act('close', {}, () => (ui.confirm = null));
    case 'reset':
      return act('reset', {}, () => {
        ui.confirm = null;
        for (const k of Object.keys(fields)) delete fields[k];
        toast('오늘을 처음부터 다시 시작해요');
      });
    case 'history':
      return openHistory();
    case 'openDay':
      return openDay(el.dataset.date);
    case 'back':
      ui.screen = null;
      return refresh();
    case 'mic':
      return listen(el.dataset.target);
  }
});

// MCP나 다른 기기에서 바뀐 것을 반영한다. 입력 중이거나 따로 연 화면에서는 다시 그리지 않는다.
const busy = () =>
  (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) || ui.capture || ui.start || ui.screen || rec;
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && !busy() && refresh());
setInterval(() => {
  if (document.visibilityState === 'visible' && !busy()) refresh();
}, 30000);

refresh();
