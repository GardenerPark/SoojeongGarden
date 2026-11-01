// 생각과 자료 웹앱. 노션이 원본이고, 이 앱은 쓰고 훑어보는 창구.
// 쓴 내용은 먼저 기기(localStorage)의 보낼 함(outbox)에 넣고, 그다음 노션에 보낸다.
// 연결이 끊기거나 실패하면 보낼 함에 남아 있다가 다시 연결되면 보낸다. 저장 실패를 빈 메모로 보여 주지 않는다.

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

// ---------- 기기 저장 ----------
const LS = { token: 'notes-token', list: 'notes-list', meta: 'notes-meta', outbox: 'notes-outbox', memo: (id) => `notes-memo-${id}` };
const load = (k, d = null) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const store = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    toast('기기 저장 공간이 부족해요. 연결된 상태에서 저장을 마쳐 주세요.');
    return false;
  }
};

let token = '';
{
  const params = new URLSearchParams(location.search);
  try {
    if (params.get('token')) localStorage.setItem(LS.token, params.get('token'));
    token = localStorage.getItem(LS.token) || '';
  } catch {
    token = params.get('token') || '';
  }
  if (params.has('token')) history.replaceState(null, '', location.pathname + location.hash);
}

const state = {
  list: load(LS.list, { memos: [], at: null }),
  meta: load(LS.meta, { tags: [], kinds: [], url: null }),
  listLoading: false,
  listError: null,
  needToken: false,
  filter: { tag: null, kind: null, q: '' },
};
const outbox = load(LS.outbox, {}); // key(메모 id 또는 local-…) → { id, base, next, appends, touched, conflict }
const status = {}; // key → { s: 'saving'|'saved'|'offline'|'failed'|'conflict', msg }
const saveOutbox = () => store(LS.outbox, outbox);

// 열어 본 메모 본문(검색용)
const bodies = new Map();
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('notes-memo-')) {
      const m = load(k);
      if (m) bodies.set(m.id, m.body || '');
    }
  }
} catch {}

// ---------- 서버 ----------
class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || '서버에 연결하지 못했어요.');
    this.status = status;
    this.data = data;
  }
}
async function api(op, args = {}) {
  let res;
  try {
    res = await fetch(`/api/${op}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError(0, { error: '연결이 끊겼어요.' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    state.needToken = true;
    render();
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data.result;
}

// ---------- 모양 ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ICON = {
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
};

const dayKey = (d) => d.toLocaleDateString('sv-SE');
function when(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (dayKey(d) === dayKey(now)) return time;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return withTime ? `어제 ${time}` : '어제';
  const date =
    d.getFullYear() === now.getFullYear()
      ? `${d.getMonth() + 1}월 ${d.getDate()}일`
      : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withTime ? `${date} ${time}` : date;
}
function sectionOf(iso) {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86400000;
  if (dayKey(d) === dayKey(new Date())) return '오늘';
  if (days < 2) return '어제';
  if (days < 7) return '지난 7일';
  if (days < 30) return '지난 30일';
  return d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}월` : `${d.getFullYear()}년`;
}

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), 3200);
}

// ---------- 메모 내용 ----------
const baseOf = (s) => ({ title: s.title || '', body: s.body || '', tags: s.tags || [], kind: s.kind || null });
const sameTags = (a = [], b = []) => [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
const sameContent = (a, b) => !!a && !!b && a.title === b.title && a.body === b.body && sameTags(a.tags, b.tags) && (a.kind || null) === (b.kind || null);
const normBody = (t) => String(t || '').replace(/\r\n?/g, '\n').replace(/[\s ]+$/, '');
const preview = (m) => {
  if (m.oneLine) return m.oneLine;
  if (m.snippet) return m.snippet;
  const body = m.body ?? bodies.get(m.id);
  return body ? body.split('\n').filter((l) => l.trim() && !l.startsWith('↳ ') && l !== '---').join(' ').slice(0, 160) : '';
};

function cacheSnap(snap) {
  bodies.set(snap.id, snap.body || '');
  store(LS.memo(snap.id), snap);
  const { blocks, body, ...item } = snap;
  item.snippet = preview(snap);
  const memos = state.list.memos.filter((m) => m.id !== snap.id);
  memos.unshift(item);
  state.list.memos = memos;
  store(LS.list, state.list);
}

// ---------- 보내기 ----------
const timers = {};
const running = new Set();

function setStatus(key, s, msg = '') {
  status[key] = { s, msg };
  if (cur && cur.key === key) {
    paintStatus();
    if (document.getElementById('pend')) paintSide();
  }
}
function schedule(key, ms = 900) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => flush(key), ms);
}

function rekey(from, to) {
  if (from === to) return;
  outbox[to] = outbox[from];
  delete outbox[from];
  status[to] = status[from];
  delete status[from];
  if (cur && cur.key === from) {
    cur.key = to;
    history.replaceState(history.state, '', `#/m/${to}`);
  }
}

async function flush(key) {
  clearTimeout(timers[key]);
  if (running.has(key) || !outbox[key] || outbox[key].conflict) return;
  running.add(key);
  try {
    for (;;) {
      const e = outbox[key];
      if (!e) break;
      if (e.next && !(e.base && sameContent(e.next, e.base))) {
        if (!e.id && !e.next.title && !e.next.body) break; // 빈 새 메모는 만들지 않는다
        const sent = structuredClone(e.next);
        setStatus(key, 'saving');
        const snap = e.id ? await api('save', { id: e.id, base: e.base, next: sent }) : await api('create', { next: sent });
        key = applySnap(key, snap, sent);
        continue;
      }
      if (e.next) e.next = null; // base와 같아졌으면 보낼 것 없음
      if (e.id && e.appends?.length) {
        setStatus(key, 'saving');
        const a = e.appends[0];
        const snap = await api('append', { id: e.id, text: a.text, at: a.at });
        e.appends.shift();
        key = applySnap(key, snap, null);
        continue;
      }
      break;
    }
    const e = outbox[key];
    if (e && !e.next && !e.appends?.length) delete outbox[key];
    saveOutbox();
    if (e?.id || !e) setStatus(key, 'saved');
  } catch (err) {
    const e = outbox[key];
    if (err.status === 409 && e) {
      e.conflict = err.data.conflict;
      saveOutbox();
      setStatus(key, 'conflict');
      if (cur?.key === key) renderMemo();
    } else if (err.status === 0) setStatus(key, 'offline');
    else setStatus(key, 'failed', err.message);
  } finally {
    running.delete(key);
  }
}

// 서버가 돌려준 최신 메모를 반영. 새 메모였으면 key가 id로 바뀐다.
function applySnap(key, snap, sent) {
  const e = outbox[key];
  cacheSnap(snap);
  e.id = snap.id;
  e.base = baseOf(snap);
  if (sent && e.next && sameContent(e.next, sent)) e.next = null;
  rekey(key, snap.id);
  saveOutbox();
  if (cur && cur.key === snap.id) {
    cur.snap = snap;
    if (!outbox[snap.id]?.next) syncEditor(!sent);
    paintSide();
  }
  return snap.id;
}

function flushAll() {
  for (const key of Object.keys(outbox)) flush(key);
}

// ---------- 목록 ----------
async function refreshList() {
  if (state.listLoading) return;
  state.listLoading = true;
  state.listError = null;
  if (!cur) paintListHead();
  try {
    const [list, meta] = await Promise.all([api('list'), api('meta')]);
    state.list = list;
    state.meta = meta;
    state.needToken = false;
    store(LS.list, list);
    store(LS.meta, meta);
  } catch (e) {
    state.listError = e.status === 0 ? '오프라인 · 기기에 있는 목록' : e.message;
  }
  state.listLoading = false;
  if (!cur) renderList();
}

function allItems() {
  const items = new Map(state.list.memos.map((m) => [m.id, { ...m }]));
  for (const [key, e] of Object.entries(outbox)) {
    const it = items.get(e.id) || { id: key, local: true, created: e.touched, edited: e.touched, tags: [], kind: null };
    if (e.next) Object.assign(it, { title: e.next.title, body: e.next.body, tags: e.next.tags, kind: e.next.kind, oneLine: it.oneLine, snippet: '' });
    if (e.touched && (!it.edited || e.touched > it.edited)) it.edited = e.touched;
    it.pending = e.conflict ? 'warn' : status[key]?.s === 'failed' ? 'warn' : 'on';
    if (!e.id && !(e.next?.title || e.next?.body)) continue;
    items.set(e.id || key, it);
  }
  return [...items.values()].sort((a, b) => (a.edited < b.edited ? 1 : -1));
}

function filtered(items) {
  const { tag, kind, q } = state.filter;
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((m) => {
    if (tag === '__none' ? m.tags?.length : tag && !m.tags?.includes(tag)) return false;
    if (kind && m.kind !== kind) return false;
    if (!words.length) return true;
    const hay = [m.title, m.oneLine, m.snippet, m.body ?? bodies.get(m.id), ...(m.tags || []).map((t) => `#${t}`)].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function paintListHead() {
  const el = document.getElementById('sync');
  if (!el) return;
  el.textContent = state.listLoading ? '불러오는 중…' : state.listError || (state.list.at ? `노션 · ${when(state.list.at, true)}` : '');
}

function renderList() {
  cur = null;
  if (state.needToken) return renderToken();
  const items = allItems();
  const shown = filtered(items);
  const tags = [...new Set([...state.meta.tags, ...items.flatMap((m) => m.tags || [])])];
  const count = (t) => items.filter((m) => m.tags?.includes(t)).length;
  const untagged = items.filter((m) => !m.tags?.length).length;
  const kinds = state.meta.kinds.length ? state.meta.kinds : [...new Set(items.map((m) => m.kind).filter(Boolean))];
  const { tag, kind, q } = state.filter;

  let html = `<div class="top"><h1>생각과 자료</h1><span class="sync" id="sync"></span></div>
    <input class="search" id="q" type="search" placeholder="검색" value="${esc(q)}" autocomplete="off">
    <div class="chips" role="group" aria-label="태그">
      <button class="chip ${!tag ? 'on' : ''}" data-tag="">전체<span class="n">${items.length}</span></button>
      ${tags.filter((t) => count(t) || tag === t).map((t) => `<button class="chip ${tag === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}<span class="n">${count(t)}</span></button>`).join('')}
      ${untagged ? `<button class="chip ${tag === '__none' ? 'on' : ''}" data-tag="__none">태그 없음<span class="n">${untagged}</span></button>` : ''}
    </div>
    <div class="chips small" role="group" aria-label="분류">
      ${kinds.map((k) => `<button class="chip ${kind === k ? 'on' : ''}" data-kind="${esc(k)}">${esc(k)}</button>`).join('')}
    </div>`;

  if (!items.length) html += `<p class="empty">${state.listLoading ? '노션에서 불러오는 중…' : state.listError ? esc(state.listError) : '아직 메모가 없어요.'}</p>`;
  else if (!shown.length) html += `<p class="empty">찾는 메모가 없어요.</p>`;
  else {
    if (tag || kind) {
      const name = [tag === '__none' ? '태그 없음' : tag ? `#${tag}` : '', kind || ''].filter(Boolean).join(' · ');
      html += `<div class="section">${esc(name)} · ${shown.length}개</div><ul class="list">${shown.map(itemHtml).join('')}</ul>`;
    } else {
      let last = null;
      let open = false;
      for (const m of shown) {
        const s = sectionOf(m.edited || m.created);
        if (s !== last) {
          if (open) html += '</ul>';
          html += `<div class="section">${esc(s)}</div><ul class="list">`;
          open = true;
          last = s;
        }
        html += itemHtml(m);
      }
      if (open) html += '</ul>';
    }
  }
  html += `<button class="fab" id="new" aria-label="새 메모">${ICON.pen}</button>`;
  $app.innerHTML = html;
  paintListHead();
}

function itemHtml(m) {
  const p = preview(m);
  return `<li><button class="item" data-open="${esc(m.id)}">
    <div class="t">${esc(m.title || '새 메모')}</div>
    <div class="m">${m.pending ? `<span class="dot ${m.pending === 'warn' ? 'warn' : ''}" title="아직 노션에 저장되지 않음"></span>` : ''}<span>${esc(when(m.edited || m.created))}</span>${(m.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
    ${p ? `<div class="p">${esc(p)}</div>` : ''}
  </button></li>`;
}

// ---------- 메모 화면 ----------
let cur = null; // { key, snap, isNew, info }
const plainOnly = (() => {
  const d = document.createElement('div');
  d.contentEditable = 'plaintext-only';
  return d.contentEditable === 'plaintext-only';
})();

function openMemo(id) {
  const cached = load(LS.memo(id)) || state.list.memos.find((m) => m.id === id) || null;
  cur = { key: id, snap: cached, isNew: false, info: false, loading: true };
  renderMemo();
  api('get', { id })
    .then((snap) => {
      if (!cur || cur.key !== id) return cacheSnap(snap);
      cacheSnap(snap);
      const hadBody = cur.snap?.body !== undefined;
      cur.snap = snap;
      cur.loading = false;
      if (!outbox[id]?.next) (hadBody && cur.editable === snap.editable ? syncEditor() : renderMemo());
      paintSide();
    })
    .catch((e) => {
      if (!cur || cur.key !== id) return;
      cur.loading = false;
      cur.loadError = e.status === 0 ? '오프라인이에요. 기기에 있는 내용을 보여 드려요.' : e.message;
      renderMemo();
    });
}

function newMemo() {
  const key = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  cur = { key, snap: null, isNew: true, info: false };
  renderMemo();
}

// 지금 화면에 보여야 할 내용: 보낼 함의 next → 아니면 노션 버전
function shown() {
  const e = outbox[cur.key];
  if (e?.next) return e.next;
  if (cur.snap?.body !== undefined) return baseOf(cur.snap);
  return null;
}

function editorText(v) {
  return v ? v.title + (v.body ? `\n${v.body}` : '') : '';
}

function renderMemo() {
  if (state.needToken) return renderToken();
  const e = outbox[cur.key];
  const snap = cur.snap;
  const v = shown();
  const editable = cur.isNew || (snap?.body !== undefined && snap.editable !== false) || (e?.next && !snap);
  cur.editable = editable;
  const ready = cur.isNew || v;

  let html = `<div class="bar">
      <button class="back" id="back">${ICON.back}메모</button>
      <div class="right"><span class="status" id="status"></span>
        ${snap?.url ? `<a class="icon" href="${esc(snap.url)}" target="_blank" rel="noopener" aria-label="노션에서 원본 열기">${ICON.open}</a>` : ''}
        ${!cur.isNew || e?.id ? `<button class="icon" id="info" aria-label="태그와 정보" aria-expanded="${cur.info}">${ICON.info}</button>` : ''}
      </div></div>
    <div class="dates" id="dates"></div>
    <div id="conflict"></div>
    <div id="infoPanel"></div>`;

  if (cur.loadError && !ready) html += `<p class="note">${esc(cur.loadError)}</p>`;
  if (!ready) html += `<p class="loading">${cur.loading ? '불러오는 중…' : '이 메모를 불러오지 못했어요.'}</p>`;
  else if (editable) {
    html += plainOnly
      ? `<div class="editor" id="ed" contenteditable="plaintext-only" spellcheck="true" data-placeholder="제목" role="textbox" aria-multiline="true" aria-label="메모. 첫 줄이 제목이에요"></div>`
      : `<textarea class="editor" id="ed" placeholder="첫 줄이 제목이 돼요" aria-label="메모. 첫 줄이 제목이에요"></textarea>`;
  } else {
    html += `<input class="title-input" id="title" aria-label="제목" value="${esc(v.title)}" placeholder="제목">
      <p class="note">표·이미지 같은 노션 서식이 있어 본문은 노션에서 고쳐요. 제목·태그 수정과 이어 쓰기는 여기서 돼요.
        ${snap.url ? `<a class="link" href="${esc(snap.url)}" target="_blank" rel="noopener">원본 보기</a>` : ''}</p>
      <div class="readonly">${(snap.blocks || []).map(lineHtml).join('')}</div>`;
  }
  if (ready && cur.loadError) html += `<p class="note">${esc(cur.loadError)}</p>`;
  html += `<div id="cont"></div>`;
  $app.innerHTML = html;

  if (ready && editable) {
    const ed = document.getElementById('ed');
    setEditor(ed, editorText(v));
    if (cur.isNew && !e) ed.focus();
  }
  paintStatus();
  paintSide();
}

function lineHtml(b) {
  const l = b.line;
  if (!b.simple) return `<div class="ln x">${esc(l)}</div>`;
  if (/^↳ \d{4}\./.test(l)) return `<div class="ln mk">${esc(l)}</div>`;
  if (/^#{1,3} /.test(l)) return `<div class="ln h">${esc(l.replace(/^#{1,3} /, ''))}</div>`;
  if (/^> /.test(l)) return `<div class="ln q">${esc(l.slice(2))}</div>`;
  if (l === '---') return '<hr>';
  return `<div class="ln">${esc(l)}</div>`;
}

function setEditor(ed, text) {
  if (ed.tagName === 'TEXTAREA') {
    ed.value = text;
    autoGrow(ed);
  } else ed.textContent = text;
}
function readEditor() {
  const ed = document.getElementById('ed');
  if (ed) {
    const text = (ed.tagName === 'TEXTAREA' ? ed.value : ed.innerText).replace(/\r\n?/g, '\n').replace(/ /g, ' ');
    const at = text.indexOf('\n');
    return { title: (at < 0 ? text : text.slice(0, at)).trim(), body: normBody(at < 0 ? '' : text.slice(at + 1)) };
  }
  const t = document.getElementById('title');
  return { title: t ? t.value.trim() : '', body: cur.snap?.body || '' };
}
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// 노션 버전이 바뀌었고 내가 고치는 중이 아니면 편집기를 맞춘다.
// 쓰는 중(포커스)에는 커서가 튀지 않게 그대로 두고, 이어 쓰기처럼 내용이 늘어난 경우(force)만 맞춘다.
function syncEditor(force = false) {
  if (!cur) return;
  const v = shown();
  if (!v) return;
  const ed = document.getElementById('ed');
  if (ed) {
    const now = readEditor();
    if (now.title === v.title && now.body === v.body) return;
    const focused = document.activeElement === ed;
    if (focused && !force) return;
    setEditor(ed, editorText(v));
    if (focused) placeCaretEnd(ed);
  } else if (cur.editable === false) renderMemo();
}
function placeCaretEnd(ed) {
  if (ed.tagName === 'TEXTAREA') return ed.setSelectionRange(ed.value.length, ed.value.length);
  const r = document.createRange();
  r.selectNodeContents(ed);
  r.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function ensureEntry() {
  let e = outbox[cur.key];
  if (!e) {
    e = outbox[cur.key] = { id: cur.isNew ? null : cur.key, base: cur.snap?.body !== undefined ? baseOf(cur.snap) : null, next: null, appends: [], touched: null };
  }
  return e;
}

function onEdit(patch = {}) {
  if (!cur) return;
  const e = ensureEntry();
  if (e.conflict) return;
  const prev = shown() || { tags: [], kind: null };
  e.next = { ...readEditor(), tags: prev.tags || [], kind: prev.kind || null, ...patch };
  e.touched = new Date().toISOString();
  saveOutbox();
  if (!e.id && !e.next.title && !e.next.body) {
    delete outbox[cur.key];
    saveOutbox();
    delete status[cur.key];
    return paintStatus();
  }
  setStatus(cur.key, 'saving');
  schedule(cur.key, patch.tags || 'kind' in patch ? 0 : 900);
}

function paintStatus() {
  const el = document.getElementById('status');
  if (!el || !cur) return;
  const st = status[cur.key];
  const e = outbox[cur.key];
  let html = '';
  let warn = false;
  if (e?.conflict) {
    html = '노션과 달라요';
    warn = true;
  } else if (st?.s === 'saving' || (e && !st)) html = navigator.onLine ? '저장 중…' : '기기에 보관됨';
  else if (st?.s === 'offline') html = '기기에 보관됨 · 연결되면 저장';
  else if (st?.s === 'failed') {
    html = `동기화 실패 <button id="retry">다시 시도</button>`;
    warn = true;
  } else if (st?.s === 'saved') html = '노션에 저장됨';
  el.innerHTML = html;
  el.className = `status${warn ? ' warn' : ''}`;
  el.title = st?.msg || '';
  if (st?.s === 'failed' && st.msg && !el.dataset.shown) {
    el.dataset.shown = '1';
    toast(st.msg);
  }
}

function paintSide() {
  if (!cur) return;
  const snap = cur.snap;
  const e = outbox[cur.key];
  const dates = document.getElementById('dates');
  if (dates) {
    const parts = [];
    if (snap?.created) parts.push(`처음 담음 ${when(snap.created, true)}`);
    if (snap?.lastAppended) parts.push(`마지막 이어 씀 ${when(snap.lastAppended, true)}`);
    else if (snap?.edited && snap.edited !== snap.created) parts.push(`수정 ${when(snap.edited, true)}`);
    dates.textContent = parts.join(' · ');
  }

  const c = document.getElementById('conflict');
  if (c) {
    if (e?.conflict) {
      const r = e.conflict.remote;
      const mine = e.next || shown();
      c.innerHTML = `<div class="conflict" role="alert">
        <div><b>노션에서도 이 메모가 바뀌었어요.</b> 어느 쪽도 지우지 않았어요. 어떻게 할지 골라 주세요.</div>
        <div class="two">
          <div class="ver"><div class="lab">노션 버전</div>${esc(editorText(r))}${r.tags?.length ? `\n\n${esc(r.tags.map((t) => `#${t}`).join(' '))}` : ''}</div>
          <div class="ver"><div class="lab">이 기기에서 쓴 버전</div>${esc(editorText(mine))}${mine?.tags?.length ? `\n\n${esc(mine.tags.map((t) => `#${t}`).join(' '))}` : ''}</div>
        </div>
        <div class="acts">
          <button class="btn" data-resolve="both">둘 다 남기기</button>
          <button class="btn ghost" data-resolve="mine">내 버전으로 저장</button>
          <button class="btn ghost" data-resolve="theirs">노션 버전 쓰기</button>
        </div>
        <div class="pending">둘 다 남기기: 노션 버전을 그대로 두고, 이 기기에서 쓴 글을 아래에 이어 쓰기로 붙여요.</div>
      </div>`;
    } else c.innerHTML = '';
  }

  const info = document.getElementById('infoPanel');
  if (info) {
    if (cur.info && (snap || e?.next)) {
      const v = shown() || { tags: [], kind: null };
      const tags = [...new Set([...state.meta.tags, ...(v.tags || [])])];
      const kinds = state.meta.kinds;
      const rows = [
        snap?.source && ['출처', `<a class="link" href="${esc(snap.source)}" target="_blank" rel="noopener">${esc(snap.source)}</a>`],
        snap?.uses?.length && ['활용처', esc(snap.uses.join(', '))],
        snap?.video && ['영상 활용', esc(snap.video)],
        snap?.status && ['정리 상태', esc(snap.status)],
        snap?.oneLine && ['한 줄 생각', esc(snap.oneLine)],
      ].filter(Boolean);
      info.innerHTML = `<div class="info">
        <div><div class="lab">태그</div><div class="chips">${tags.map((t) => `<button class="chip ${v.tags?.includes(t) ? 'on' : ''}" data-settag="${esc(t)}">#${esc(t)}</button>`).join('') || '<span class="pending">노션 목록을 불러오면 태그를 고를 수 있어요.</span>'}</div></div>
        ${kinds.length ? `<div><div class="lab">분류</div><div class="chips small">${kinds.map((k) => `<button class="chip ${v.kind === k ? 'on' : ''}" data-setkind="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>` : ''}
        ${rows.length ? `<div class="kv">${rows.map(([k, val]) => `<span>${k}</span><span>${val}</span>`).join('')}</div>` : ''}
        ${snap?.url ? `<a class="link" href="${esc(snap.url)}" target="_blank" rel="noopener">노션에서 원본 열기</a>` : ''}
      </div>`;
    } else info.innerHTML = '';
  }

  // 이어 쓰기: 입력창은 한 번만 그리고(쓰는 중 포커스 유지), 보내는 중인 덧붙임만 다시 그린다.
  const cont = document.getElementById('cont');
  if (cont) {
    const id = e?.id || (!cur.isNew && cur.key);
    if (id && !document.getElementById('more')) {
      cont.innerHTML = `<div class="cont">
        <div id="pend"></div>
        <div class="lab">생각 이어 쓰기</div>
        <textarea id="more" placeholder="오늘 떠오른 생각을 덧붙여요" aria-label="생각 이어 쓰기"></textarea>
        <div class="row"><span class="pending">처음 담은 날짜는 그대로, 덧붙인 시각이 함께 남아요.</span><button class="btn" id="append" disabled>덧붙이기</button></div>
      </div>`;
    }
    const pend = document.getElementById('pend');
    if (pend) {
      const off = status[cur.key]?.s === 'offline';
      pend.innerHTML = (e?.appends || [])
        .map((a) => `<div class="mark">${esc(when(a.at, true))} · ${off ? '기기에 보관됨' : '보내는 중'}</div><div class="readonly">${esc(a.text)}</div>`)
        .join('');
    }
  }
}

function resolveConflict(how) {
  const e = outbox[cur.key];
  if (!e?.conflict) return;
  const remote = e.conflict.remote;
  const mine = e.next || shown();
  if (how === 'theirs' && !confirm('이 기기에서 쓴 내용을 버리고 노션 버전을 쓸까요?')) return;
  e.base = baseOf(remote);
  cur.snap = remote;
  cacheSnap(remote);
  if (how === 'mine') e.next = mine;
  else {
    e.next = null;
    if (how === 'both') {
      // 노션 버전에 없는 줄만 덧붙인다(같은 줄이 두 번 쌓이지 않게).
      const have = new Set([remote.title, ...(remote.body || '').split('\n')]);
      const extra = [mine.title, ...(mine.body || '').split('\n')].filter((l) => l.trim() && !have.has(l));
      const text = extra.length ? extra.join('\n') : '';
      const tagNote = sameTags(mine.tags, remote.tags) ? '' : `\n(이 기기에서 고른 태그: ${(mine.tags || []).map((t) => `#${t}`).join(' ') || '없음'})`;
      if (text || tagNote) e.appends.unshift({ text: `(이 기기에서 쓴 글)\n${text}${tagNote}`.trim(), at: new Date().toISOString() });
    }
  }
  e.conflict = null;
  saveOutbox();
  renderMemo();
  flush(cur.key);
}

function appendMore() {
  const el = document.getElementById('more');
  const text = el.value.trim();
  if (!text) return;
  const e = ensureEntry();
  e.appends.push({ text, at: new Date().toISOString() });
  e.touched = new Date().toISOString();
  saveOutbox();
  el.value = '';
  setStatus(cur.key, 'saving');
  paintSide();
  flush(cur.key);
}

// ---------- 토큰 ----------
function renderToken() {
  $app.innerHTML = `<form class="token" id="tokenForm">
    <h1>생각과 자료</h1>
    <p class="pending">이 앱의 접속 비밀번호(NOTES_TOKEN)를 넣어 주세요. 이 기기에만 저장돼요.</p>
    <input id="tokenInput" type="password" autocomplete="current-password" aria-label="접속 비밀번호">
    <button class="btn" type="submit">열기</button>
  </form>`;
}

// ---------- 길 ----------
function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/m\/(.+)$/))) {
    const id = decodeURIComponent(m[1]);
    if (id.startsWith('local-')) {
      cur = { key: id, snap: null, isNew: true, info: false };
      renderMemo();
    } else openMemo(id);
  } else if (h === '#/new') {
    newMemo();
    history.replaceState({ app: true }, '', `#/m/${cur.key}`);
  } else {
    renderList();
    if (!state.list.at || Date.now() - Date.parse(state.list.at) > 20000) refreshList();
  }
}
function go(hash) {
  leaveMemo();
  history.pushState({ app: true }, '', hash);
  route();
}
function leaveMemo() {
  if (!cur) return;
  const key = cur.key;
  if (outbox[key] && timers[key]) flush(key);
}
function back() {
  leaveMemo();
  if (history.state?.app) history.back();
  else {
    history.replaceState(null, '', '#/');
    route();
  }
}

// ---------- 이벤트 ----------
$app.addEventListener('click', (ev) => {
  const t = ev.target.closest('button, a');
  if (!t) return;
  if (t.id === 'new') {
    leaveMemo();
    newMemo();
    history.pushState({ app: true }, '', `#/m/${cur.key}`);
  } else if (t.dataset.open) go(`#/m/${encodeURIComponent(t.dataset.open)}`);
  else if (t.dataset.tag !== undefined) {
    state.filter.tag = t.dataset.tag && state.filter.tag !== t.dataset.tag ? t.dataset.tag : null;
    renderList();
  } else if (t.dataset.kind !== undefined) {
    state.filter.kind = state.filter.kind === t.dataset.kind ? null : t.dataset.kind;
    renderList();
  } else if (t.id === 'back') back();
  else if (t.id === 'info') {
    cur.info = !cur.info;
    t.setAttribute('aria-expanded', cur.info);
    paintSide();
  } else if (t.dataset.settag !== undefined) {
    const v = shown() || { tags: [] };
    const tags = v.tags?.includes(t.dataset.settag) ? v.tags.filter((x) => x !== t.dataset.settag) : [...(v.tags || []), t.dataset.settag];
    onEdit({ tags });
    paintSide();
  } else if (t.dataset.setkind !== undefined) {
    const v = shown() || {};
    onEdit({ kind: v.kind === t.dataset.setkind ? null : t.dataset.setkind });
    paintSide();
  } else if (t.dataset.resolve) resolveConflict(t.dataset.resolve);
  else if (t.id === 'append') appendMore();
  else if (t.id === 'retry') {
    document.getElementById('status').dataset.shown = '';
    flush(cur.key);
  }
});

$app.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'q') {
    state.filter.q = t.value;
    const pos = t.selectionStart;
    renderList();
    const q = document.getElementById('q');
    q.focus();
    q.setSelectionRange(pos, pos);
  } else if (t.id === 'ed' || t.id === 'title') {
    if (t.tagName === 'TEXTAREA') autoGrow(t);
    onEdit();
  } else if (t.id === 'more') {
    document.getElementById('append').disabled = !t.value.trim();
  }
});

$app.addEventListener('keydown', (ev) => {
  if (ev.target.id === 'more' && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) appendMore();
  if (ev.target.id === 'title' && ev.key === 'Enter') ev.target.blur();
});

$app.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'tokenForm') return;
  ev.preventDefault();
  token = document.getElementById('tokenInput').value.trim();
  try {
    localStorage.setItem(LS.token, token);
  } catch {}
  state.needToken = false;
  route();
  flushAll();
});

window.addEventListener('popstate', () => {
  leaveMemo();
  route();
});
window.addEventListener('online', () => {
  flushAll();
  if (!cur) refreshList();
});
window.addEventListener('offline', () => paintStatus());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    for (const k of Object.keys(timers)) if (outbox[k]) flush(k);
  } else if (!cur) refreshList();
});
// 실패·오프라인으로 남은 것은 30초마다 다시 보낸다.
setInterval(() => {
  for (const [k] of Object.entries(outbox)) if (['offline', 'failed'].includes(status[k]?.s) || !status[k]) flush(k);
}, 30000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

route();
flushAll();
