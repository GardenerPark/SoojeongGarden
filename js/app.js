import { SPACES, routeIntent, suggestFocus, sharedContext, localDate, reflectionDraft } from './rules.js';
import { load, save, uid } from './store.js';
import { loadStatus, aiStatus, ask } from './ai.js';

const state = load();
const $app = document.getElementById('app');
const FACTORS = ['수면', '운동', '명상', '식사', '회의', '사람', '이동', '햇빛', '카페인'];

const commit = () => { save(state); render(); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => localDate();
const todays = (list) => list.filter((x) => x.date === today());
const latestCheckin = () => todays(state.checkins).at(-1) || null;
const todayTask = () => todays(state.sessions).at(-1)?.task || state.activeSession?.task || null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3000);
}

function park(text, from) {
  const r = routeIntent(text);
  state.parked.push({ id: uid(), date: today(), text, space: r.space, from, done: false });
  save(state);
  return r.space;
}

function contextNote(space) {
  const items = sharedContext(space, { checkin: latestCheckin(), focusTask: todayTask() });
  if (!items.length) return '';
  return `<details class="ctx"><summary>${esc(items[0].source)}에서 가져왔어요</summary>
    <ul>${items.map((i) => `<li>${esc(i.text)} <span class="muted">· ${esc(i.source)}</span></li>`).join('')}</ul></details>`;
}

// ---------- 입구 ----------
let pendingRoute = null;

function routeBasis(r) {
  if (r.reason === '직접 선택') return '직접 선택';
  if (r.reason) return `AI 판단: ${esc(r.reason)}`;
  const kw = r.matched ? `‘${esc(r.matched)}’로 판단` : '규칙으로 판단';
  return r.checking ? `${kw} · AI 확인 중…` : kw;
}

function viewHome() {
  const c = latestCheckin();
  const open = state.parked.filter((p) => !p.done);
  const route = pendingRoute && (() => {
    const s = SPACES[pendingRoute.space];
    const items = sharedContext(pendingRoute.space, { checkin: c, focusTask: todayTask() });
    return `<section class="card route">
      <p class="eyebrow">연결 제안</p>
      <h3>${esc(s.label)}${s.ready ? ' 공간으로 연결할게요' : '에게 맡겨둘까요?'}</h3>
      <p class="muted">“${esc(pendingRoute.text)}” · ${routeBasis(pendingRoute)}</p>
      ${items.length ? `<p class="small">전달할 정보: ${items.map((i) => esc(i.text)).join(', ')}</p>` : ''}
      <div class="row">
        ${s.ready ? `<button class="primary" data-act="go" data-space="${pendingRoute.space}">${esc(s.purpose)}</button>` : ''}
        <button data-act="park-route">보관하기</button>
        <select data-act="reroute" aria-label="다른 공간 선택">
          <option value="">다른 공간으로…</option>
          ${Object.entries(SPACES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}
        </select>
        <button class="ghost" data-act="cancel-route">취소</button>
      </div></section>`;
  })();

  return `
    <section class="hero">
      <h1>지금 뭐 하고 싶으세요?</h1>
      <form data-form="intent" class="row">
        <input name="text" placeholder="예: 일 시작해야 하는데 너무 피곤해" autocomplete="off" required />
        <button class="primary">연결</button>
      </form>
      <p class="small muted">AI: ${esc(aiStatus().label)}${aiStatus().enabled ? '' : ' · 키워드 규칙으로 연결해요'}</p>
    </section>
    ${route || ''}
    <section class="grid">
      ${Object.entries(SPACES).map(([k, s]) => `
        <a class="card space ${s.ready ? '' : 'soon'}" ${s.ready ? `href="#/${k}"` : ''}>
          <strong>${esc(s.label)}</strong><span class="muted">${esc(s.purpose)}${s.ready ? '' : ' · 준비 중'}</span>
        </a>`).join('')}
    </section>
    <section class="card">
      <h3>오늘</h3>
      <p>${c ? `에너지 ${c.energy}/5${c.mood ? ` · ${esc(c.mood)}` : ''}` : '<span class="muted">아직 체크인 전이에요.</span> <a href="#/energy">기록하기</a>'}</p>
      ${todayTask() ? `<p>중요한 일: ${esc(todayTask())}</p>` : ''}
    </section>
    <section class="card">
      <h3>맡겨둔 생각 <span class="muted">${open.length}</span></h3>
      ${open.length ? `<ul class="list">${open.map((p) => `
        <li><span class="tag">${esc(SPACES[p.space]?.label || p.space)}</span> ${esc(p.text)}
          <button class="ghost small" data-act="done-parked" data-id="${p.id}">처리함</button></li>`).join('')}</ul>`
        : '<p class="muted">비어 있어요. 집중 중에 떠오른 생각이 여기 쌓여요.</p>'}
    </section>`;
}

// ---------- 에너지 돌아보기 ----------
function viewEnergy() {
  const cs = todays(state.checkins);
  const ss = todays(state.sessions);
  const draft = reflectionDraft({ checkins: cs, sessions: ss, parked: todays(state.parked) });
  const saved = state.reflections[today()] || '';
  return `
    <header class="space-head"><p class="eyebrow">에너지 돌아보기</p><h1>지금 상태 기록</h1>${contextNote('energy')}</header>
    <form data-form="checkin" class="card">
      <fieldset class="scale"><legend>에너지</legend>
        ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="energy" value="${n}" required /><span>${n}</span></label>`).join('')}
      </fieldset>
      <label>기분 한 단어 <input name="mood" placeholder="예: 멍함, 차분" autocomplete="off" /></label>
      <fieldset class="chips"><legend>영향을 준 것</legend>
        ${FACTORS.map((f) => `<label><input type="checkbox" name="factors" value="${f}" /><span>${f}</span></label>`).join('')}
      </fieldset>
      <label>메모 <span class="muted small">(이 공간에만 저장돼요)</span><textarea name="note" rows="2"></textarea></label>
      <button class="primary">기록</button>
    </form>
    <section class="card">
      <h3>오늘의 흐름</h3>
      ${cs.length || ss.length ? `<ul class="list">
        ${[...cs.map((c) => ({ at: c.at, t: `에너지 ${c.energy}/5${c.mood ? ` · ${esc(c.mood)}` : ''}${c.factors?.length ? ` · ${c.factors.map(esc).join(', ')}` : ''}${c.note ? `<br><span class="muted">${esc(c.note)}</span>` : ''}` })),
          ...ss.map((s) => ({ at: s.at, t: `집중 ${s.minutes}분 · ${esc(s.task)}${s.energyAfter ? ` · 끝나고 ${s.energyAfter}/5` : ''}${s.note ? `<br><span class="muted">${esc(s.note)}</span>` : ''}` }))]
          .sort((a, b) => a.at - b.at)
          .map((x) => `<li><span class="time">${new Date(x.at).toTimeString().slice(0, 5)}</span> ${x.t}</li>`).join('')}
      </ul>` : '<p class="muted">아직 기록이 없어요.</p>'}
    </section>
    <form data-form="reflection" class="card">
      <h3>하루 회고</h3>
      ${draft.length ? `<ul class="draft">${draft.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="muted">기록이 쌓이면 초안이 만들어져요.</p>'}
      <label>빠진 맥락 한 줄<textarea name="text" rows="2" placeholder="오늘 에너지를 가장 많이 쓴/채운 건?">${esc(saved)}</textarea></label>
      <button>회고 저장</button>
    </form>`;
}

// ---------- 집중해서 일하기 ----------
let focusStage = null; // null(선택) | 'review'

function viewFocus() {
  const a = state.activeSession;
  if (a && focusStage !== 'review') return focusRunning(a);
  if (a && focusStage === 'review') return focusReview(a);
  const c = latestCheckin();
  const sug = suggestFocus(c?.energy);
  return `
    <header class="space-head"><p class="eyebrow">집중해서 일하기</p><h1>중요한 일 하나 시작</h1>
      ${c ? contextNote('focus') : '<p class="small muted">에너지 체크인이 없어 기본값을 써요. <a href="#/energy">체크인</a></p>'}
    </header>
    <form data-form="focus-start" class="card">
      <label>오늘 가장 중요한 일<input name="task" required autocomplete="off" value="${esc(todayTask() || '')}" placeholder="예: 제안서 작성" /></label>
      <label>첫 행동 <span class="muted small">${esc(sug.hint)}</span>
        <span class="row"><input name="step" required autocomplete="off" placeholder="예: 핵심 문장 세 개 쓰기" />
        ${aiStatus().enabled ? '<button type="button" data-act="ai-step">AI로 줄이기</button>' : ''}</span></label>
      <fieldset class="scale"><legend>시간</legend>
        ${[10, 15, 25].map((m) => `<label><input type="radio" name="minutes" value="${m}" ${m === sug.minutes ? 'checked' : ''} /><span>${m}분</span></label>`).join('')}
      </fieldset>
      <button class="primary big">시작</button>
    </form>`;
}

function remaining(a) {
  return Math.max(0, a.startedAt + a.minutes * 60000 - Date.now());
}
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function focusRunning(a) {
  return `
    <section class="focus-run">
      <p class="eyebrow">${esc(a.task)}</p>
      <h1 class="step">${esc(a.step)}</h1>
      <div class="timer" id="timer">${mmss(remaining(a))}</div>
      <div class="row center"><button class="primary" data-act="focus-end">끝내기</button></div>
      <form data-form="capture" class="capture">
        <input name="text" placeholder="떠오른 생각은 여기 맡겨두기" autocomplete="off" required />
        <button>맡겨두기</button>
      </form>
    </section>`;
}

function focusReview(a) {
  return `
    <header class="space-head"><p class="eyebrow">집중 끝</p><h1>${esc(a.step)}</h1></header>
    <form data-form="focus-review" class="card">
      <fieldset class="scale"><legend>첫 행동, 해냈나요?</legend>
        <label><input type="radio" name="done" value="1" required /><span>해냈어요</span></label>
        <label><input type="radio" name="done" value="0" /><span>아직</span></label>
      </fieldset>
      <fieldset class="scale"><legend>지금 에너지 <span class="muted small">시작 전 ${a.energyBefore ?? '–'}/5</span></legend>
        ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="energyAfter" value="${n}" required /><span>${n}</span></label>`).join('')}
      </fieldset>
      <label>한 줄 회고<input name="note" autocomplete="off" placeholder="예: 시작하니 생각보다 괜찮았음" /></label>
      <button class="primary">저장</button>
    </form>`;
}

// ---------- 렌더 & 이벤트 ----------
function currentView() {
  const r = location.hash.replace('#/', '') || 'home';
  return ['home', 'energy', 'focus'].includes(r) ? r : 'home';
}

function render() {
  const v = currentView();
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
  document.body.dataset.view = v;
  document.body.classList.toggle('focusing', v === 'focus' && !!state.activeSession && focusStage !== 'review');
  $app.innerHTML = { home: viewHome, energy: viewEnergy, focus: viewFocus }[v]();
}

$app.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);
  switch (f.dataset.form) {
    case 'intent': {
      const text = fd.get('text').trim();
      const ai = aiStatus().enabled;
      pendingRoute = { text, ...routeIntent(text), checking: ai };
      render();
      if (ai) {
        ask('route', { text }).then((r) => {
          if (pendingRoute?.text !== text) return; // 그사이 다른 요청을 했으면 무시
          pendingRoute = r ? { text, space: r.space, reason: r.reason } : { ...pendingRoute, checking: false };
          if (currentView() === 'home') render();
        });
      }
      return;
    }
    case 'checkin':
      state.checkins.push({
        id: uid(), date: today(), at: Date.now(), energy: Number(fd.get('energy')),
        mood: fd.get('mood').trim(), factors: fd.getAll('factors'), note: fd.get('note').trim(),
      });
      toast('기록했어요.');
      return commit();
    case 'reflection':
      state.reflections[today()] = fd.get('text').trim();
      toast('회고를 저장했어요.');
      return commit();
    case 'focus-start':
      state.activeSession = {
        id: uid(), task: fd.get('task').trim(), step: fd.get('step').trim(),
        minutes: Number(fd.get('minutes')), startedAt: Date.now(), energyBefore: latestCheckin()?.energy ?? null,
      };
      focusStage = null;
      return commit();
    case 'capture': {
      const text = fd.get('text').trim();
      const sp = park(text, 'focus');
      f.reset();
      return toast(`${SPACES[sp].label} 보관함에 맡겨뒀어요. 하던 일을 이어가세요.`);
    }
    case 'focus-review': {
      const a = state.activeSession;
      state.sessions.push({
        ...a, date: today(), at: a.startedAt, done: fd.get('done') === '1',
        energyAfter: Number(fd.get('energyAfter')), note: fd.get('note').trim(),
        actualMinutes: Math.round((Math.min(Date.now(), a.startedAt + a.minutes * 60000) - a.startedAt) / 60000),
      });
      state.activeSession = null;
      focusStage = null;
      toast('저장했어요. 에너지 기록에도 남았어요.');
      return commit();
    }
  }
});

$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'SELECT') return;
  switch (b.dataset.act) {
    case 'go':
      pendingRoute = null;
      location.hash = `#/${b.dataset.space}`;
      return;
    case 'park-route':
      state.parked.push({ id: uid(), date: today(), text: pendingRoute.text, space: pendingRoute.space, from: 'home', done: false });
      toast(`${SPACES[pendingRoute.space].label} 보관함에 맡겨뒀어요.`);
      pendingRoute = null;
      return commit();
    case 'cancel-route':
      pendingRoute = null;
      return render();
    case 'done-parked': {
      const p = state.parked.find((x) => x.id === b.dataset.id);
      if (p) p.done = true;
      return commit();
    }
    case 'ai-step': {
      const form = b.closest('form');
      const task = form.task.value.trim();
      if (!task) { form.task.focus(); return toast('중요한 일을 먼저 적어주세요.'); }
      b.disabled = true;
      b.textContent = '생각 중…';
      ask('firstStep', { task, energy: latestCheckin()?.energy ?? null, minutes: Number(new FormData(form).get('minutes')) })
        .then((r) => {
          b.disabled = false;
          b.textContent = 'AI로 줄이기';
          if (r) { form.step.value = r.step; form.step.focus(); } else toast('AI 제안을 받지 못했어요. 직접 적어주세요.');
        });
      return;
    }
    case 'focus-end':
      focusStage = 'review';
      return render();
  }
});

$app.addEventListener('change', (e) => {
  if (e.target.dataset.act === 'reroute' && e.target.value && pendingRoute) {
    pendingRoute = { text: pendingRoute.text, space: e.target.value, matched: null, reason: '직접 선택' };
    render();
  }
});

setInterval(() => {
  const el = document.getElementById('timer');
  const a = state.activeSession;
  if (!el || !a) return;
  const r = remaining(a);
  el.textContent = mmss(r);
  if (r === 0 && !el.dataset.rang) {
    el.dataset.rang = '1';
    el.classList.add('over');
    document.title = '⏰ 끝 · Soojeong Garden';
  }
}, 1000);

window.addEventListener('hashchange', () => { pendingRoute = null; render(); });
render();
loadStatus().then(render);
