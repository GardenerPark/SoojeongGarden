// Signal & Noise 웹앱. 서버가 정한 단계(phase)에 맞는 화면 하나만 그린다.
//   morning → (pick) → next ⇄ focus → review → next … → closed

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
const ui = { pick: false, capture: params.has('capture'), confirmClose: false, fromId: null, related: true, focusId: null };
const fields = {}; // 다시 그려도 입력 중인 글이 남도록

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

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
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), 2400);
}

const MIC = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const PLUS = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const mic = (target) => (SR ? `<button type="button" class="round outline" data-action="mic" data-target="${target}" aria-label="말로 적기">${MIC}</button>` : '');

const anchor = () => `<footer class="anchor"><span class="label">오늘의 하나</span><b>${esc(view.one)}</b></footer>`;

// ---------- 화면 ----------
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

function screenMorning() {
  const lines = view.morning.map((t) => `<li>${esc(t.text)}</li>`).join('');
  return `
    <span class="date">${dateLabel(view.date)} · 아침</span>
    <h1>머릿속에 있는 걸<br>전부 꺼내 보세요</h1>
    <ul class="lines">${lines}</ul>
    <form data-form="dump" class="stack grow">
      <label class="label" for="dump">떠오르는 대로</label>
      <textarea class="field" id="dump" data-enter rows="2" placeholder="한 줄 적고 Enter">${val('dump')}</textarea>
      <p class="hint">Enter를 누르면 한 줄씩 저장돼요.</p>
    </form>
    <div class="row">${mic('dump')}<button class="primary" data-action="pick">오늘의 하나 정하기</button></div>`;
}

function screenPick() {
  const options = [...view.morning, ...view.archive];
  const chosen = new Set([fields.one, fields.some1, fields.some2].filter(Boolean));
  const chip = (t) => `<button type="button" class="chip${chosen.has(t.text) ? ' on' : ''}" data-action="fill" data-text="${esc(t.text)}">${esc(t.text)}</button>`;
  return `
    <span class="date">${dateLabel(view.date)}</span>
    <h1>오늘의 하나는?</h1>
    <div class="stack">
      <label class="label" for="one">오늘의 하나 · 필수</label>
      <input class="field strong" id="one" value="${val('one')}" placeholder="예: 유튜브 촬영">
    </div>
    <div class="stack">
      <label class="label" for="some1">썸 · 최대 2개</label>
      <input class="field" id="some1" value="${val('some1')}" placeholder="예: 필라테스">
      <input class="field" id="some2" value="${val('some2')}" aria-label="두 번째 썸">
    </div>
    ${options.length ? `<div class="stack"><span class="label">아침 기록과 보관함에서 고르기</span><div class="chips">${options.map(chip).join('')}</div></div>` : ''}
    <div class="grow"></div>
    <button class="primary" data-action="setOne">이걸로 시작</button>
    <button class="link" data-action="unpick">더 쏟아내기</button>`;
}

function screenNext() {
  const first = view.finishedCount === 0;
  const chips = [
    ...view.candidates.map((t) => ({ text: t.text, fromId: t.id, related: true, kind: '지금 하기로 고른 것' })),
    ...view.some.map((s) => ({ text: s, related: false, kind: '썸' })),
    ...view.recent.map((b) => ({ text: b.minutes ? `${b.title} ${b.minutes}분` : b.title, related: b.related, kind: '최근 블록 다시 시작' })),
  ];
  const groups = [...new Set(chips.map((c) => c.kind))].map((kind) => `
    <div class="stack"><span class="label">${kind}</span><div class="chips">${chips
      .filter((c) => c.kind === kind)
      .map((c) => `<button type="button" class="chip" data-action="decl" data-text="${esc(c.text)}" data-from="${c.fromId || ''}" data-related="${c.related}">${esc(c.text)}</button>`)
      .join('')}</div></div>`);
  return `
    <span class="date">${dateLabel(view.date)} · 끝낸 하나 ${view.finishedCount}개</span>
    <h1>${first ? '첫 번째 하나는?' : '다음 하나는?'}</h1>
    <form data-form="start" class="stack">
      <label class="label" for="decl">무엇을, 얼마나</label>
      <input class="field strong" id="decl" value="${val('decl')}" placeholder="예: 촬영 대본 정리 90분" autocomplete="off">
      <label class="check"><input type="checkbox" id="related" ${ui.related ? 'checked' : ''}> 오늘의 하나를 위한 블록</label>
    </form>
    ${groups.join('')}
    ${view.review ? `<p class="hint">거르지 않은 생각 ${view.review}개는 다음 회고에서 만나요.</p>` : ''}
    <div class="grow"></div>
    <div class="row"><button class="primary" data-action="start">시작</button><button class="round outline" data-action="capture" aria-label="쏟아내기">${PLUS}</button></div>
    ${confirmClose()}
    ${anchor()}`;
}

function screenFocus() {
  const b = view.active;
  return `
    <span class="date">지금 · ${hhmm(b.startedAt)} 시작</span>
    <div class="focus-main">
      <span class="tag${b.related ? '' : ' other'}">${b.related ? '오늘의 하나를 위한 블록' : '오늘의 하나와 다른 블록'}</span>
      <h1 class="big">${esc(b.title)}</h1>
      <div class="timer" id="timer">00:00</div>
      ${b.minutes ? '<div class="bar"><i id="bar" style="width:0%"></i></div>' : ''}
      <span class="hint" id="timer-note"></span>
    </div>
    <div class="row"><button class="primary" data-action="end">끝냈어요</button><button class="round" data-action="capture" aria-label="쏟아내기">${PLUS}</button></div>
    ${anchor()}`;
}

function screenReview() {
  const b = view.lastBlock;
  const t = view.review[0];
  return `
    <span class="date">블록 끝 · ${hhmm(b.startedAt)}–${hhmm(b.endedAt)}</span>
    <h1>${esc(b.title)}</h1>
    <div class="stack">
      <label class="label" for="note">어디까지 했나요</label>
      <input class="field" id="note" data-note="${b.id}" value="${esc(fields.note ?? b.note)}" placeholder="예: 구조 완성, 숫자는 다음 블록에서">
    </div>
    ${
      t
        ? `<div class="between"><span class="label">쏟아낸 것 거르기 · 기준은 오늘의 하나</span><span class="hint">${view.review.length}개 남음</span></div>
           <div class="card">
             <p>${esc(t.text)}</p>
             <div class="tri">
               <button data-action="sort" data-id="${t.id}" data-a="now">지금</button>
               <button data-action="sort" data-id="${t.id}" data-a="keep">보관</button>
               <button data-action="sort" data-id="${t.id}" data-a="drop">지우기</button>
             </div>
           </div>`
        : '<p class="hint">거를 생각이 없어요. 다음 하나로 넘어가요.</p>'
    }
    <div class="grow"></div>
    <button class="primary" data-action="finishReview">다음 하나 정하기</button>
    ${confirmClose('오늘은 여기까지')}
    ${anchor()}`;
}

function screenClosed() {
  const s = view.summary;
  const done = s.blocks.filter((b) => b.endedAt);
  return `
    <span class="date">${dateLabel(view.date)} · 마무리</span>
    <div class="stack">
      <div class="count"><b>${s.finishedCount}</b><span>개의 하나를 끝냈어요</span></div>
      ${s.one ? `<p class="hint">그중 <b>${s.relatedCount}블록</b>이 오늘의 하나, ${esc(s.one)}에</p>` : ''}
    </div>
    <ol class="timeline">${done.map((b) => `<li class="${b.related ? 'rel' : ''}"><time>${hhmm(b.startedAt)}</time><span>${esc(b.title)}</span></li>`).join('')}</ol>
    ${done.length ? '<div class="legend"><span class="rel">오늘의 하나 관련</span><span>그 밖의 블록</span></div>' : ''}
    <div class="grow"></div>
    ${
      s.carried.length
        ? `<div class="box"><span class="label">내일 아침 보관함으로 · ${s.carried.length}개</span><div class="chips">${s.carried.map((t) => `<span class="chip">${esc(t.text)}</span>`).join('')}</div></div>`
        : ''
    }
    <p class="hint">내일 아침에 다시 만나요.</p>`;
}

function confirmClose(label = '오늘 마무리하기') {
  if (!ui.confirmClose) return `<button class="link" data-action="confirmClose">${label}</button>`;
  return `
    <div class="box">
      <p class="hint">오늘을 마무리할까요? 거르지 않은 생각은 내일 아침 보관함으로 가요.</p>
      <div class="row"><button class="primary" data-action="close">마무리</button><button class="ghost" data-action="cancelClose">취소</button></div>
    </div>`;
}

function sheet() {
  return `
    <div class="backdrop" data-action="closeCapture"></div>
    <form class="sheet" data-form="capture" aria-label="쏟아내기">
      <div class="grab"></div>
      <label class="label" for="cap">떠오른 생각을 던지세요</label>
      <textarea class="field" id="cap" data-enter rows="3">${val('cap')}</textarea>
      <div class="row"><button class="primary">던지기</button>${mic('cap')}</div>
      <p class="hint">던지면 바로 돌아가요. 분류도 확인도 없어요.</p>
    </form>`;
}

function render() {
  if (needToken) {
    $app.innerHTML = screenToken();
    return;
  }
  if (!view) return;
  const p = view.phase;
  const body =
    p === 'morning' ? (ui.pick ? screenPick() : screenMorning()) : p === 'focus' ? screenFocus() : p === 'review' ? screenReview() : p === 'next' ? screenNext() : screenClosed();
  const canCapture = p === 'focus' || p === 'next' || p === 'review';
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
  if (view?.phase !== 'focus') return;
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

// ---------- 이벤트 ----------
$app.addEventListener('input', (e) => {
  if (e.target.id) fields[e.target.id] = e.target.value;
  if (e.target.id === 'related') ui.related = e.target.checked;
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
  if (form === 'dump' || form === 'capture') {
    const id = form === 'dump' ? 'dump' : 'cap';
    const text = (fields[id] || '').trim();
    if (!text) return;
    await act('dump', { text }, () => {
      fields[id] = '';
      if (form === 'capture') {
        ui.capture = false;
        toast('던졌어요');
      } else ui.focusId = 'dump';
    });
  }
  if (form === 'start') startBlock();
});

function startBlock() {
  const declaration = (fields.decl || '').trim();
  if (!declaration) return toast('무엇을 할지 적어 주세요.');
  act('start', { declaration, related: ui.related, fromId: ui.fromId || undefined }, () => {
    fields.decl = '';
    ui.fromId = null;
    ui.related = true;
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

function listen(target) {
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = false;
  rec.onresult = (ev) => {
    const said = ev.results[0][0].transcript;
    fields[target] = [(fields[target] || '').trim(), said].filter(Boolean).join(' ');
    const el = document.getElementById(target);
    if (el) el.value = fields[target];
  };
  rec.onerror = () => toast('음성을 듣지 못했어요. 키보드의 받아쓰기도 쓸 수 있어요.');
  rec.start();
  toast('듣고 있어요');
}

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'pick') return (ui.pick = true), render();
  if (a === 'unpick') return (ui.pick = false), (ui.focusId = 'dump'), render();
  if (a === 'fill') return fill(el.dataset.text);
  if (a === 'setOne') {
    const one = (fields.one || '').trim();
    if (!one) return toast('오늘의 하나를 적거나 골라 주세요.');
    const some = [fields.some1, fields.some2].map((s) => (s || '').trim()).filter(Boolean);
    const chosen = new Set([one, ...some]);
    const fromIds = [...view.morning, ...view.archive].filter((t) => chosen.has(t.text)).map((t) => t.id);
    return act('setOne', { one, some, fromIds }, () => {
      ui.pick = false;
      for (const k of ['one', 'some1', 'some2']) fields[k] = '';
    });
  }
  if (a === 'decl') {
    fields.decl = el.dataset.text;
    ui.fromId = el.dataset.from || null;
    ui.related = el.dataset.related === 'true';
    ui.focusId = 'decl';
    return render();
  }
  if (a === 'start') return startBlock();
  if (a === 'end') return act('end', {}, () => (fields.note = undefined));
  if (a === 'sort') return act('sort', { id: el.dataset.id, action: el.dataset.a });
  if (a === 'finishReview') {
    const note = document.getElementById('note');
    const save = note && note.value !== view.lastBlock.note ? api('note', { id: view.lastBlock.id, note: note.value }) : Promise.resolve();
    return save.then(() => act('finishReview', {}, () => (fields.note = undefined))).catch((err) => toast(err.message));
  }
  if (a === 'capture') return (ui.capture = true), render();
  if (a === 'closeCapture') return (ui.capture = false), render();
  if (a === 'confirmClose') return (ui.confirmClose = true), render();
  if (a === 'cancelClose') return (ui.confirmClose = false), render();
  if (a === 'close') return act('close', {}, () => (ui.confirmClose = false));
  if (a === 'mic') return listen(el.dataset.target);
});

// MCP나 다른 기기에서 바뀐 것을 반영한다. 입력 중일 때는 다시 그리지 않는다.
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
setInterval(() => {
  const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (document.visibilityState === 'visible' && !typing && !ui.capture) refresh();
}, 30000);

refresh();
