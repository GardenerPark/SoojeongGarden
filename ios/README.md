# 하나 (Signal & Noise) iOS 앱

하나 끝내고 다음 하나. 웹 버전(`signal-noise/`)과 같은 하루 규칙을 쓰는 네이티브 SwiftUI 앱입니다.

- iOS 18 이상, 아이폰 세로 화면
- 기록은 기기 안(앱 그룹)에만 저장. 계정·서버·분석 도구 없음
- 잠금화면 위젯(오늘의 하나 + 지금 블록), 지금 블록 Live Activity, 쏟아내기 컨트롤(제어 센터·잠금화면·액션 버튼)
- 단축어 "생각 던지기": 앱을 열지 않고 말하거나 적어서 저장 (액션 버튼에 연결)
- 말하는 동안 글자가 입력창에 바로 찍히는 음성 입력 (가능하면 기기 안에서 인식)

## 구조

```
project.yml          XcodeGen 설정 (Xcode 프로젝트를 만든다)
Shared/              앱과 위젯이 같이 쓰는 코드
  Core.swift         하루 규칙 (signal-noise/core.js와 같은 규칙)
  SharedStore.swift  앱 그룹 폴더의 JSON 파일 하나에 저장
  Intents.swift      단축어: 생각 던지기, 쏟아내기 열기
  FocusActivity.swift Live Activity 데이터
App/                 화면, 음성 입력, Live Activity 켜고 끄기
Widgets/             잠금화면 위젯, 컨트롤, Live Activity 화면
Tests/               하루 규칙 테스트
Resources/           앱 아이콘, 개인정보 매니페스트
```

## 1. Mac에서 빌드하기

준비물: Mac, Xcode 16 이상, Apple 개발자 계정(출시하려면 유료 Apple Developer Program, 연 99달러).

```bash
brew install xcodegen
cd ios
xcodegen            # SignalNoise.xcodeproj 생성
open SignalNoise.xcodeproj
```

1. `project.yml`의 `DEVELOPMENT_TEAM`에 내 팀 ID를 넣고 `xcodegen`을 다시 실행한다. (팀 ID: developer.apple.com → Account → Membership)
2. 번들 ID `com.soojeonggarden.signalnoise`와 앱 그룹 `group.com.soojeonggarden.signalnoise`가 이미 다른 사람 것이면 `project.yml`과 `Shared/SharedStore.swift`에서 같이 바꾼다.
3. 아이폰을 연결하고 Run. 테스트는 ⌘U.

이 코드는 Linux에서 작성해서 아직 한 번도 컴파일하지 않았습니다. 빌드 오류가 나면 오류 메시지를 그대로 보내 주세요.

## 2. 출시 순서

1. **기기에서 하루 써 보기**: 위젯, Live Activity, 단축어, 음성 입력을 실제로 확인한다.
2. **App Store Connect에 앱 만들기**: appstoreconnect.apple.com → 앱 → + → 새로운 앱. 플랫폼 iOS, 기본 언어 한국어, 번들 ID 선택, SKU는 `signalnoise`.
3. **업로드**: Xcode → Product → Archive → Distribute App → App Store Connect.
4. **TestFlight**: 업로드한 빌드로 나와 테스트할 사람 3~5명에게 먼저 배포한다 (설계 문서의 검증 단계).
5. **심사 제출**: 아래 내용을 채우고 빌드를 고른 뒤 심사에 제출한다. 보통 1~3일 걸린다.

## 3. App Store Connect에 넣을 것

| 항목 | 값 |
|---|---|
| 이름 (30자) | 하나: 하나 끝내고 다음 하나 |
| 부제 (30자) | 생각은 쏟아내고, 지금은 하나만 |
| 카테고리 | 생산성 (보조: 라이프스타일) |
| 가격 | 무료 |
| 개인정보처리방침 URL | https://signal-noise-six.vercel.app/privacy.html |
| 지원 URL | https://signal-noise-six.vercel.app/support.html |
| 앱 개인정보 보호 | "데이터를 수집하지 않음" |
| 연령 등급 | 모든 항목 "없음" → 4+ |
| 수출 규정 (암호화) | 사용 안 함 (Info.plist에 이미 표시) |

**프로모션 텍스트 (170자)**

> 하나 끝내고 다음 하나. 그러다 보면 많이 해낸 하루. 떠오르는 생각은 언제든 던져 두고, 지금은 하나에만 집중하세요.

**설명**

> 아침에 정한 오늘의 하나가 하루의 기준이 됩니다.
> 집중하는 중에 떠오른 생각은 버리지 않고 던져 두었다가, 하나를 끝낸 순간에만 다시 걸러요.
>
> • 아침 쏟아내기: 머릿속에 있는 걸 한 줄씩 꺼내요.
> • 오늘의 하나: 하루의 기준 하나와 썸 2개까지.
> • 지금: 화면에는 지금 하는 블록 하나만. "촬영 대본 정리 90분"처럼 말하듯 시작해요.
> • 쏟아내기: + 버튼, 액션 버튼, 제어 센터, Siri로 바로 던져요. 분류도 확인도 없어요.
> • 전환 회고: 블록이 끝나면 쏟아낸 것을 지금 / 보관 / 지우기로 걸러요.
> • 하루 마무리: 끝낸 하나의 수를 보고, 남은 것은 내일 아침 보관함으로.
> • 잠금화면 위젯과 Live Activity로 오늘의 하나와 지금 블록이 늘 보여요.
>
> 기록은 내 아이폰 안에만 저장돼요. 계정도 광고도 없어요.

**키워드 (100자)**

> 집중,할일,투두,우선순위,뽀모도로,타이머,브레인덤프,모닝페이지,메모,생산성,루틴,플래너,원씽

**심사 메모 (App Review Information → Notes)**

> 로그인이 필요 없습니다. 첫 화면에서 생각을 몇 줄 적고 "오늘의 하나 정하기" → "이걸로 시작" → "촬영 대본 정리 90분"을 적고 "시작"을 누르면 집중 화면과 Live Activity를 볼 수 있습니다. "끝냈어요"를 누르면 전환 회고 화면이 나옵니다. 마이크는 사용자가 마이크 버튼을 누를 때만 씁니다.

**스크린샷**: 6.9인치(1320×2868) 세로 3~5장이 필요합니다. 시뮬레이터 iPhone 16 Pro Max에서 ⌘S로 찍으면 됩니다. 추천 순서: 지금(집중) → 잠금화면 위젯과 Live Activity → 쏟아내기 → 전환 회고 → 하루 마무리.

## 4. 1.0 이후

- 웹 버전과 기록 동기화, 앱용 MCP 연동 (계정이 필요해서 1.1로)
- 블록 시간이 끝났을 때 알림
- 전환 회고의 AI 관련성 제안 (수동 거르기로 먼저 검증)
