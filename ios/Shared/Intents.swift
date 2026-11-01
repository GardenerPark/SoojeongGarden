// 앱 밖에서 쏟아내기: 단축어, 액션 버튼, 제어 센터·잠금화면 컨트롤.
//  - AddThoughtIntent: 말하거나 적으면 앱을 열지 않고 바로 저장 (액션 버튼에 연결하면 마찰 0)
//  - OpenCaptureIntent: 앱을 열고 바로 쏟아내기 창을 띄운다

import AppIntents
import Foundation

struct AddThoughtIntent: AppIntent {
    static let title: LocalizedStringResource = "생각 던지기"
    static let description = IntentDescription("떠오른 생각을 분류 없이 던져 둡니다. 다음 전환 회고에서 거를 수 있어요.")
    static let openAppWhenRun = false

    @Parameter(title: "생각", requestValueDialog: "무엇이 떠올랐나요?")
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try SharedStore.update { state, now, today in
            try state.addThought(text, now: now, today: today)
        }
        return .result(dialog: "던졌어요.")
    }
}

struct OpenCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "쏟아내기 열기"
    static let description = IntentDescription("앱을 열고 바로 쏟아내기 창을 띄웁니다.")
    static let openAppWhenRun = true

    static let flagKey = "openCaptureRequested"

    @MainActor
    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: SharedStore.appGroup)?.set(true, forKey: Self.flagKey)
        return .result()
    }
}
