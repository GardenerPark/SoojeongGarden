import AppIntents

/// 설정 없이 바로 쓰는 Siri·단축어 문구. 액션 버튼 → 단축어 → "쏟아내기"로 연결한다.
struct SignalNoiseShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureThoughtIntent(),
            phrases: [
                "\(.applicationName)에 쏟아내기",
                "\(.applicationName) 쏟아내기",
                "\(.applicationName)에 생각 놓아두기",
            ],
            shortTitle: "쏟아내기",
            systemImageName: "square.and.pencil"
        )
        AppShortcut(
            intent: OpenCaptureIntent(),
            phrases: ["\(.applicationName) 쏟아내기 열기"],
            shortTitle: "쏟아내기 열기",
            systemImageName: "plus.circle"
        )
    }
}
