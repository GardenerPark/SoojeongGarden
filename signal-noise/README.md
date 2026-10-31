# Signal & Noise

하나 끝내고 다음 하나. 그러다 보면 많이 해낸 하루.

떠오르는 생각은 언제든 쏟아내고, 지금의 하나에만 집중하게 돕는 하루 집중 앱입니다. 이 폴더는 **검증 단계용 웹앱 + 서버 + MCP**입니다. 잠금화면 위젯과 Live Activity는 iOS 앱(SwiftUI) 단계에서 같은 API 위에 붙입니다.

## 하루 루프

| 단계 | 화면 | 하는 일 |
|---|---|---|
| morning | 아침 쏟아내기 → 오늘의 하나 | 떠오르는 대로 적고(Enter로 한 줄씩), 오늘의 하나 1개와 썸 최대 2개를 고른다. 고르지 않은 생각은 보관함으로 |
| next | 다음 하나 | "촬영 대본 정리 90분"처럼 말하듯 적고 시작. 오늘의 하나를 위한 블록인지 체크 |
| focus | 지금 | 블록 하나와 타이머만 보인다. + 버튼으로 쏟아내기, 목록은 보이지 않는다 |
| review | 전환 회고 | 어디까지 했는지 한 줄, 쏟아낸 것을 지금 / 보관 / 지우기로 거른다 |
| closed | 하루 마무리 | 끝낸 하나의 수, 그중 오늘의 하나를 위한 블록 수, 내일 아침 보관함으로 갈 것 |

- 블록은 한 번에 하나만 열린다. 필라테스나 루틴처럼 오늘의 하나와 다른 일도 블록이 된다.
- 끝낸 하나의 수(북극성)는 "끝냈어요"로 닫은 블록만 센다. 다음 날이 되면 열린 블록은 자동으로 닫히고 수에서 빠진다.
- 거르지 않은 생각은 하루를 마무리하거나 날짜가 바뀌면 보관함으로 가서, 다음 날 아침 오늘의 하나를 고를 때 다시 보인다.

## 실행

```bash
cd signal-noise
npm start            # http://localhost:8100
npm test
```

빌드도 의존성도 없어요 (Node 18+). 기록은 `data/store.json` 한 파일에 저장돼요(git에 올라가지 않음).

| 환경변수 | 기본값 | 뜻 |
|---|---|---|
| `SN_TOKEN` | 없음 | 정하면 모든 API·MCP 요청에 토큰이 필요하고, 휴대폰에서 접속할 수 있게 0.0.0.0에서 연다 |
| `PORT` | 8100 | |
| `SN_DATA` | `data/store.json` | 데이터 파일 위치 |
| `SN_TZ` | `Asia/Seoul` | 하루가 바뀌는 기준 시간대 |

`signal-noise/.env`에 적어 두어도 됩니다.

### 아이폰에서 쓰기

1. 서버를 휴대폰에서 닿는 곳에서 `SN_TOKEN`과 함께 연다 (집 Mac + Tailscale, 또는 Railway 같은 호스팅. 호스팅이면 `SN_DATA`를 영구 볼륨에).
2. Safari에서 `https://<주소>/?token=<토큰>`을 한 번 연다. 토큰은 그 기기에 저장되고 주소창에서 지워진다.
3. 공유 → **홈 화면에 추가**.

`/?capture=1`로 열면 쏟아내기 창이 바로 열려요.

### 액션 버튼으로 쏟아내기 (단축어)

앱을 열지 않고 던지는 방법입니다. 단축어 앱에서:

1. **텍스트 받아쓰기** (또는 *입력 요청*)
2. **URL의 콘텐츠 가져오기**: `https://<주소>/api/dump`, 방법 `POST`, 헤더 `Authorization: Bearer <토큰>`, 요청 본문 JSON `text` = 받아쓴 텍스트
3. 설정 → 동작 버튼 → 단축어 → 위 단축어

## MCP로 연결하기

같은 데이터에 Claude 같은 AI가 붙을 수 있게 MCP 도구 9개를 열어 둡니다.

| 도구 | 하는 일 |
|---|---|
| `get_today` | 오늘 단계와 필요한 목록 (읽기) |
| `add_thought` | 생각 하나 던지기 |
| `set_today_one` | 오늘의 하나와 썸 정하기 |
| `start_block` / `end_block` | 블록 시작("필라테스 2시간") / 끝내기 |
| `list_thoughts` | review / next / archive / morning 목록 (읽기) |
| `sort_thought` | now / keep / drop으로 거르기 |
| `close_day` | 하루 마무리 |
| `get_day` | 날짜별 기록과 끝낸 하나의 수 (읽기) |

**원격 (HTTP, 서버가 떠 있을 때)**: 주소는 `http(s)://<주소>/mcp`

```bash
# Claude Code
claude mcp add --transport http signal-noise https://<주소>/mcp --header "Authorization: Bearer <토큰>"
```

claude.ai의 사용자 지정 커넥터처럼 헤더를 넣을 수 없는 곳에는 `https://<주소>/mcp?token=<토큰>`을 씁니다. 이 주소는 비밀번호처럼 다뤄 주세요.

**로컬 (stdio)**: 서버 없이 같은 데이터 파일을 직접 읽고 씁니다.

```bash
claude mcp add signal-noise -- node /절대/경로/signal-noise/mcp-stdio.js
```

Claude Desktop의 `claude_desktop_config.json`:

```json
{ "mcpServers": { "signal-noise": { "command": "node", "args": ["/절대/경로/signal-noise/mcp-stdio.js"] } } }
```

## 구조

```
core.js        하루 규칙 (오늘의 하나, 블록, 쏟아내기, 회고, 마무리, 선언 해석)
service.js     저장소(JSON 파일) + 규칙을 묶은 ops. 웹앱과 MCP가 같이 쓴다
server.js      웹앱 + REST(/api/<op>) + MCP(/mcp, Streamable HTTP의 JSON 응답)
mcp.js         MCP 도구 정의와 JSON-RPC 처리
mcp-stdio.js   로컬 MCP 클라이언트용 stdio 서버
web/           흑백 모바일 웹앱 (홈 화면에 추가해서 사용)
```

## 아직 없는 것

- 잠금화면 위젯, Live Activity, 액션 버튼 직접 연결 → iOS 앱 단계
- 블록 시간이 끝났을 때 알림 (지금은 화면에서 `+mm:ss`로만 표시)
- AI의 관련성 제안 (수동 거르기로 먼저 검증)
