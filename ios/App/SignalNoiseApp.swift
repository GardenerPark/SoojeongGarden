import AppIntents
import SwiftUI

@main
struct SignalNoiseApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model)
        }
    }
}

/// 단축어 앱과 Siri, 액션 버튼에서 바로 고를 수 있게 등록한다.
struct SignalNoiseShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddThoughtIntent(),
            phrases: [
                "\(.applicationName)에 생각 던지기",
                "\(.applicationName)에 쏟아내기",
            ],
            shortTitle: "생각 던지기",
            systemImageName: "plus.bubble"
        )
        AppShortcut(
            intent: OpenCaptureIntent(),
            phrases: ["\(.applicationName) 쏟아내기 열기"],
            shortTitle: "쏟아내기 열기",
            systemImageName: "square.and.pencil"
        )
    }
}
