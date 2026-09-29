// 로컬 서버(/api/ai)를 통해 구독 로그인된 AI에 묻는다.
// 실패하면 null을 돌려주고, 앱은 규칙만으로 계속 동작한다.

let status = { enabled: false, label: '확인 중' };

export async function loadStatus() {
  try {
    const r = await fetch('/api/ai/status', { signal: AbortSignal.timeout(3000) });
    status = r.ok ? await r.json() : { enabled: false, label: '서버 없음' };
  } catch {
    status = { enabled: false, label: '서버 없음' };
  }
  return status;
}

export const aiStatus = () => status;

export async function ask(task, input) {
  if (!status.enabled) return null;
  try {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, input }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await r.json();
    return r.ok ? data.result : null;
  } catch {
    return null;
  }
}
