# Soojeong Garden

에너지를 축으로 하루를 기록하고, 적은 에너지로도 **가장 중요한 일부터** 시작하도록 돕는 개인용 도구.

> 입구는 하나로 모으고, 실행 공간은 나누고, 기억은 필요한 만큼만 연결한다.

## 지금 있는 것 (v0.1)

| 공간 | 목적 | 하는 일 |
|---|---|---|
| 입구 | 지금 뭐 하고 싶으세요? | 입력하면 어느 공간으로 연결할지 **제안**하고, 전달할 정보를 보여준 뒤 내가 선택 |
| 에너지 돌아보기 | 지금 상태 기록 | 에너지 1–5, 기분 한 단어, 영향 요인, 메모 → 오늘의 흐름 → 회고 초안 + 한 줄 |
| 집중해서 일하기 | 중요한 일 하나 시작 | 중요한 일 → 첫 행동 → 에너지에 맞춘 10/15/25분 타이머 → 종료 체크인 |
| 맡겨둔 생각 | 주의는 그대로 | 집중 중 떠오른 일은 보관만 하고 화면은 그대로 유지 |

학습·생활 비서 공간은 아직 없어요. 그쪽으로 향하는 요청은 **보관**만 돼요.

## 실행

```bash
cp .env.example .env   # AI 연결 설정 (선택)
npm start              # http://localhost:8000
npm test
```

빌드도 의존성도 없어요 (Node 18+). 기록은 브라우저 localStorage에만 저장돼요.

### AI 연결 (선택): 구독 로그인 사용

API 키 대신 **OpenClaw**, **Hermes Agent**, **Claude Code**에 로그인된 ChatGPT·Claude 구독으로 동작해요. 설정 방법은 [docs/ai-setup.md](docs/ai-setup.md)에 있어요.
AI는 입구의 연결 판단과 집중 공간의 “AI로 줄이기”에만 쓰고, 연결이 없으면 규칙만으로 동작해요.

## 구조

```
index.html, styles.css
js/rules.js   연결 규칙·에너지 제안·공간별 공유 범위 (직접 고치는 곳)
js/store.js   기억 저장소 (profile / 날짜별 상태 / 공간별 기록)
js/app.js     화면
js/ai.js      로컬 서버의 AI 호출 (실패 시 null → 규칙으로)
server.js     로컬 서버: 정적 파일 + /api/ai 중계 (127.0.0.1 전용)
server/       AI 연결 방식(providers)과 프롬프트(prompts)
docs/architecture.md  설계와 다음 단계
```

연결 키워드는 `js/rules.js`의 `ROUTES`에서 내 분류에 맞게 고치면 돼요.

## 설치 없이 쓰기 (claude.ai 링크 버전)

`web/claude-artifact.html`은 claude.ai 아티팩트로 올린 한 장짜리 버전이에요. 링크만 열면 되고, 기록은 내 claude.ai 계정에 저장돼요. AI 기능은 내 Claude 계정으로 동작해요 (처음 쓸 때 한 번 허락을 물어요). 로컬 서버 버전과 기능은 같아요.
