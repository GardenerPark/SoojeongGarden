// 순수 규칙 모음: 요청 연결(라우팅), 에너지 기반 제안, 공간별 공유 정보.
// UI·저장소와 분리해 두어 테스트하고 직접 고치기 쉽게 한다.

export const SPACES = {
  energy: { label: '에너지 돌아보기', purpose: '지금 상태 기록', ready: true },
  focus: { label: '집중해서 일하기', purpose: '중요한 일 하나 시작', ready: true },
  study: { label: '학습', purpose: '오늘 연습 시작', ready: false },
  life: { label: '생활 비서', purpose: '생각난 일 맡겨두기', ready: false },
};

// 내 분류 방식에 맞게 직접 고치는 연결 규칙. 먼저 맞는 규칙이 이긴다.
export const ROUTES = [
  { space: 'study', keywords: ['영어', '공부', '단어', '회화', '명상 공부', '내면소통', '미토콘드리아', '복습'] },
  { space: 'energy', keywords: ['피곤', '지쳐', '에너지', '기분', '감정', '회고', '명상', '운동', '루틴', '잠', '수면', '일기'] },
  { space: 'focus', keywords: ['업무', '일 시작', '일해야', '집중', '제안서', '작업', '마감', '회의 준비', '개발', '만들기'] },
  { space: 'life', keywords: ['쇼핑', '구매', '사야', '장보기', '여행', '숙소', '브랜드', '신상', '피부', '화장품', '예약'] },
];

export function routeIntent(text) {
  const t = (text || '').trim();
  if (!t) return null;
  for (const r of ROUTES) {
    const hit = r.keywords.find((k) => t.includes(k));
    if (hit) return { space: r.space, matched: hit };
  }
  return { space: 'life', matched: null }; // 모르면 생활 비서 보관함으로
}

// 에너지가 낮아도 '쉬운 일'로 바꾸지 않는다. 같은 중요한 일의 시작 단위와 시간만 줄인다.
export function suggestFocus(energy) {
  if (energy == null) return { minutes: 15, hint: '시작 행동을 한 문장으로 적어보세요.' };
  if (energy <= 2) return { minutes: 10, hint: '같은 일을 10분 안에 끝낼 크기로 줄여보세요. 예: 핵심 문장 세 개 쓰기' };
  if (energy === 3) return { minutes: 15, hint: '첫 15분에 끝낼 한 덩어리를 정해보세요.' };
  return { minutes: 25, hint: '가장 어려운 부분부터 시작해보세요.' };
}

// 공간마다 필요한 만큼만 공유한다. 감정·명상 원문은 에너지 공간 밖으로 나가지 않는다.
export function sharedContext(space, { checkin, focusTask } = {}) {
  const items = [];
  if (checkin && space !== 'energy') {
    items.push({ source: '에너지 기록', text: `오늘 에너지 ${checkin.energy}/5` });
    if (checkin.energy <= 2 && space !== 'life') items.push({ source: '에너지 기록', text: '오늘은 부담을 낮추고 싶음' });
  }
  if (focusTask && space === 'energy') {
    items.push({ source: '집중 공간', text: `오늘 중요한 일: ${focusTask}` });
  }
  return items;
}

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 저녁 회고 초안: 하루 기록을 모아 보여주고, 사용자는 빠진 맥락만 더한다.
export function reflectionDraft({ checkins = [], sessions = [], parked = [] }) {
  const lines = [];
  if (checkins.length) {
    const es = checkins.map((c) => c.energy);
    lines.push(`에너지 체크인 ${checkins.length}번 (${es.join(' → ')})`);
    const factors = [...new Set(checkins.flatMap((c) => c.factors || []))];
    if (factors.length) lines.push(`영향 요인: ${factors.join(', ')}`);
  }
  for (const s of sessions) {
    const delta = s.energyAfter != null && s.energyBefore != null ? s.energyAfter - s.energyBefore : null;
    const d = delta == null ? '' : delta > 0 ? ` · 에너지 +${delta}` : delta < 0 ? ` · 에너지 ${delta}` : ' · 에너지 그대로';
    lines.push(`집중 ${s.minutes}분: ${s.task} — ${s.done ? '해냄' : '진행 중'}${d}`);
  }
  if (parked.length) lines.push(`맡겨둔 생각 ${parked.length}개`);
  return lines;
}
