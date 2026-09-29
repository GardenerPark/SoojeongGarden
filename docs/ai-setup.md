# AI 연결: API 키 대신 구독 로그인 쓰기

앱은 AI를 직접 부르지 않아요. **내 컴퓨터에서 돌아가는 로컬 서버**(`server.js`)가 구독 로그인된 도구에 요청을 중계해요.

```
브라우저 ──/api/ai──▶ server.js (127.0.0.1) ──▶ OpenClaw Gateway / Hermes API 서버 / claude -p
                                                    └─ ChatGPT(Codex) 또는 Claude 구독 로그인
```

- 토큰은 `.env`에만 있고 브라우저로 가지 않아요.
- AI는 **제안만** 해요. 입구의 연결 카드, 집중 공간의 “AI로 줄이기”. 결과는 늘 내가 고르거나 고쳐요.
- AI 연결이 꺼져 있거나 실패해도 키워드 규칙으로 그대로 동작해요.
- 내가 버튼을 누를 때만 호출해요. 자동 호출이 없어서 구독 한도를 거의 쓰지 않아요.

## 1) OpenClaw

1. OpenClaw에서 모델을 구독 로그인으로 연결해요.
   - ChatGPT: Codex(ChatGPT) 로그인
   - Claude: Claude Code를 설치하고 로그인한 뒤 모델을 `claude-cli/*`로 선택
2. Gateway 설정에서 Chat Completions 엔드포인트를 켜요 (기본은 꺼져 있어요).
   ```json5
   { gateway: { http: { endpoints: { chatCompletions: { enabled: true } } } } }
   ```
3. `.env`
   ```
   AI_PROVIDER=openclaw
   AI_TOKEN=<gateway.auth.token>
   # 도구 없는 전용 agent를 만들었다면: AI_MODEL=openclaw/<agentId>
   ```

## 2) Hermes Agent

1. Hermes에서 모델을 구독 로그인으로 연결해요 (ChatGPT/Codex 로그인, 또는 Claude 플러그인 + Claude Code 로그인).
2. `~/.hermes/.env`
   ```
   API_SERVER_ENABLED=true
   API_SERVER_KEY=<아무 긴 문자열>
   ```
   그다음 `hermes gateway`를 실행해요 (기본 `127.0.0.1:8642`).
3. `.env`
   ```
   AI_PROVIDER=hermes
   AI_TOKEN=<API_SERVER_KEY와 같은 값>
   ```

## 3) Claude Code 직접 (가장 단순)

Hermes나 OpenClaw 없이 Claude 구독만 쓰려면, Claude Code를 설치하고 로그인한 뒤:
```
AI_PROVIDER=claude-cli
# AI_MODEL=sonnet   (선택)
```
서버가 `claude -p`를 호출해요. `ANTHROPIC_API_KEY`가 있으면 구독이 아니라 API로 과금되니, 서버는 그 변수를 지우고 실행해요.

## 주의

- **API 키를 넣으면 구독과 별도로 과금돼요.** 각 도구에서 API 키가 아니라 구독 로그인으로 연결했는지 확인하세요.
- **Claude 구독 정책은 자주 바뀌어요.** 2026년 4월 외부 도구에서 구독 사용이 막혔다가 5월에 다시 허용됐어요. 6월에는 별도 크레딧 전환 계획이 보류됐고, 지금은 구독 한도에서 차감돼요. 쓰기 전에 Anthropic 안내를 한 번 확인하세요.
- **Gateway 토큰은 관리자 권한이에요.** OpenClaw·Hermes는 터미널·파일 도구를 가진 agent라서, 이 앱이 보내는 요청도 그 권한으로 실행돼요. 가능하면 **도구를 끈 전용 agent**를 만들어 연결하고, 둘 다 `127.0.0.1`에만 열어두세요.
- **보내는 정보는 최소한이에요.** 연결 판단에는 입력한 한 문장만, 첫 행동 제안에는 할 일·에너지 숫자·시간만 보내요. 감정 메모 원문은 보내지 않아요.
