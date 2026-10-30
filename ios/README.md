# 하나 — Signal & Noise iOS MVP

> 하나 끝내고 다음 하나. 그러다 보면 많이 해낸 하루.

Notion 문서 「Signal & Noise — MVP 설계」를 그대로 옮긴 iOS 앱이에요. 목표는 **하루 루프 한 바퀴가 끊김 없이 도는 것**이에요.

```
아침 쏟아내기 → 오늘의 하나 → [ 블록 시작 선언 → (쏟아내기) → 끝냈어요 → 전환 회고 ]× N → 하루 마무리 → 다음 날 아침 보관함
```

## 화면

| 화면 | 파일 | 하는 일 |
|---|---|---|
| 아침 쏟아내기 | `Views/MorningView.swift` | 열자마자 입력 상태. 음성이나 타이핑으로 써요. 저장 버튼 없이 쓰는 대로 저장돼요 |
| 오늘의 하나 | `Views/TheOneView.swift` | 아침 기록과 보관함을 눌러 채워요. 하나는 필수, 썸은 최대 2개예요 |
| 지금 (홈) | `Views/NowView.swift` | 지금의 블록 하나만 보여줘요. "필라테스 2시간"처럼 말로 시작하고, 오늘의 하나가 항상 아래에 보여요 |
| 쏟아내기 | `Views/CaptureSheet.swift` | 적고 Return, 또는 말하고 멈추면 끝이에요. 쏟아낸 목록은 보여주지 않아요 |
| 전환 회고 | `Views/TransitionView.swift` | 상태 한 줄 → 하나씩 **지금 / 보관 / 지우기** → 다음 하나 |
| 하루 마무리 | `Views/DayCloseView.swift` | 끝낸 블록들을 한 줄로 이어 보여줘요. 남은 생각은 내일 아침 보관함으로 가요 |

## 앱 밖에서 쏟아내기 (마찰 0)

| 어디서 | 어떻게 |
|---|---|
| **액션 버튼** | 설정 → 액션 버튼 → 단축어 → "쏟아내기": 앱을 열지 않고 말하거나 적으면 끝나요. 앱을 열고 싶으면 "컨트롤 → 쏟아내기"를 고르세요 |
| **Siri** | "하나에 쏟아내기" |
| **잠금화면 위젯** | 오늘의 하나(직사각형·한 줄)와 쏟아내기(원형, 누르면 입력이 바로 열려요) |
| **제어 센터 / 잠금화면 컨트롤** | "쏟아내기" 컨트롤 (iOS 18) |

## AI

AI는 문서대로 **두 군데에서만** 써요. 둘 다 기기 안에서 돌아가고(iOS 26+ Apple 온디바이스 모델), 모델이 없으면 규칙으로 대신해요. 판단은 항상 사용자가 해요.

1. 전환 회고: 쏟아낸 것이 오늘의 하나와 관련 있어 보이면 표시하고, 그 경우 "지금" 버튼을 강조해요 (`Suggester.swift`, `Relevance.swift`)
2. 말로 한 선언을 블록으로 바꾸기: "기획서 초안 45분 동안" → 제목 "기획서 초안", 45분 (`DeclarationParser.swift`)

## 열린 질문에 대한 MVP 기본값

| 질문 | 지금 동작 | 바꾸는 곳 |
|---|---|---|
| 아침에 뽑히지 않은 생각 | 아침 글은 그날의 기록으로 남아요. 보관함 항목은 고르거나 지울 때까지 매일 아침 다시 보여요 | `TheOneView` |
| 블록 시간 | 끝냈다고 할 때까지 열어둬요. 선언한 시간은 기준으로만 보여주고, 지나면 색만 바뀌어요 | `CurrentBlockCard` |
| 썸 표시 | 홈에는 오늘의 하나만 보여요. 썸은 전환 회고의 다음 하나 후보로 나와요 | `DayEngine.nextCandidates` |
| AI 제안 | 첫 버전부터 넣되, 표시만 해요 (기기 안 처리) | `Suggester` |

하루의 경계는 **새벽 4시**예요. 그 전까지는 전날로 쳐요 (`DayEngine.dayStartHour`).

## 실행 (Mac)

필요한 것: Xcode 16 이상, iOS 18 이상 기기. 온디바이스 AI는 iOS 26 이상과 Apple Intelligence 지원 기기에서만 켜져요.

```bash
brew install xcodegen
cd ios
xcodegen generate          # SignalNoise.xcodeproj 생성
open SignalNoise.xcodeproj
```

1. 두 타깃(SignalNoise, SignalNoiseWidget)의 **Signing & Capabilities**에서 Team을 고르세요.
2. 번들 ID를 바꿀 때는 App Group도 같이 바꾸세요. `project.yml`의 `group.com.soojeong.signalnoise`와 `AppConstants.appGroup`이 같아야 위젯과 Siri가 같은 기록을 봐요.
3. 기기를 연결하고 실행하세요.

핵심 로직 테스트:

```bash
cd ios/Packages/SignalNoiseCore && swift test
```

## 구조

```
ios/
  project.yml                      XcodeGen 설정 (앱 + 위젯 확장, App Group)
  Packages/SignalNoiseCore/        UI와 무관한 하루 루프 규칙 (테스트 포함)
    Models.swift                   Thought / Block / Day / GardenState
    DayEngine.swift                하루 루프: 아침 → 하나 → 블록 → 회고 → 마무리
    DeclarationParser.swift        "필라테스 2시간" → 블록
    Relevance.swift                오늘의 하나와의 관련성 (규칙)
    GardenStore.swift              App Group JSON 저장소, 위젯 스냅샷
  SignalNoise/                     앱 (SwiftUI)
  SignalNoiseWidget/               잠금화면 위젯 + 제어 센터 컨트롤
  Shared/CaptureIntents.swift      앱·위젯이 같이 쓰는 App Intent (쏟아내기)
```

기록은 기기 안의 App Group 폴더(`garden.json`)에만 있어요. 서버도, 계정도 없어요.

## 다음 단계 (문서 기준)

캘린더 읽기로 가용 시간 보여주기 · 주간 회고 · 보관함에 오래 남은 시그널 다시 꺼내기 · 투두 앱으로 내보내기. 진행 중인 블록을 잠금화면 Live Activity로 보여주는 것도 다음 후보예요.
