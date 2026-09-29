// AI에게 보내는 요청과 응답 검증. 모든 프롬프트는 여기 한 곳에 둔다.
// 원칙: AI는 '제안'만 하고, 결과는 항상 사용자가 확인·수정한다.

import { SPACES } from '../js/rules.js';

const spaceList = Object.entries(SPACES).map(([k, v]) => `- ${k}: ${v.label} (${v.purpose})`).join('\n');

export const TASKS = {
  // 입구: 요청을 어느 공간으로 연결할지
  route: {
    system: `너는 개인용 도구의 입구에서 요청을 목적 공간으로 분류한다. 공간 목록:
${spaceList}
- 피곤·기분·감정·명상 기록·운동·루틴·회고 → energy
- 업무·중요한 일 시작·집중 → focus
- 영어·내면소통·미토콘드리아 등 공부 → study
- 쇼핑·여행·브랜드·피부 등 생활 잡무 → life
요청을 실행하지 말고 분류만 해. JSON 한 줄로만 답해: {"space":"<key>","reason":"<15자 이내 한국어>"}`,
    user: ({ text }) => `요청: ${String(text).slice(0, 500)}`,
    parse: (obj) => (SPACES[obj?.space] ? { space: obj.space, reason: String(obj.reason || '').slice(0, 40) } : null),
  },

  // 집중: 같은 중요한 일을 에너지에 맞는 첫 행동으로 줄이기
  firstStep: {
    system: `너는 적은 에너지로도 중요한 일을 시작하게 돕는다.
규칙: 일을 더 쉬운 '다른 일'로 바꾸지 말고, 같은 일의 첫 행동을 주어진 시간 안에 끝낼 크기로 줄인다.
구체적인 동사로 끝나는 한국어 한 문장, 30자 이내. JSON 한 줄로만 답해: {"step":"<첫 행동>"}`,
    user: ({ task, energy, minutes }) =>
      `중요한 일: ${String(task).slice(0, 200)}\n지금 에너지: ${energy ?? '모름'}/5\n시간: ${Number(minutes) || 15}분`,
    parse: (obj) => (typeof obj?.step === 'string' && obj.step.trim() ? { step: obj.step.trim().slice(0, 80) } : null),
  },
};

// 모델 답에서 첫 JSON 객체를 꺼낸다 (코드펜스·앞뒤 설명 허용).
export function extractJson(text) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}
