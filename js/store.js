// 기억 저장소. 세 층으로 나눈다:
//  - profile: 내가 직접 정한 목표·원칙 (오래 유지)
//  - checkins: 날짜가 붙은 오늘 상태 (영구 성향으로 굳히지 않음)
//  - sessions / parked / reflections: 공간별 기록
// 지금은 브라우저 localStorage. 나중에 서버나 동기화 저장소로 바꿀 때 이 파일만 고치면 된다.

const KEY = 'soojeong-garden:v1';

const empty = () => ({
  profile: { principles: ['에너지가 낮으면 쉬운 일이 아니라, 중요한 일을 작게 시작한다.'] },
  checkins: [],
  sessions: [],
  parked: [],
  reflections: {},
  activeSession: null,
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가 환경에서도 앱은 동작 */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);
