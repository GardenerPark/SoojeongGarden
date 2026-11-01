import AppIntents
import Foundation
import SignalNoiseCore
import WidgetKit

// 앱과 위젯 확장에 모두 들어가는 App Intent.
// 액션 버튼, Siri, 단축어, 제어 센터 어디서든 쏟아내기를 한 번에 연다.

/// 앱을 열지 않고 쏟아낸다. 액션 버튼에 단축어로 걸면 말하거나 적고 끝.
struct CaptureThoughtIntent: AppIntent {
    static let title: LocalizedStringResource = "쏟아내기"
    static let description = IntentDescription("떠오른 생각을 앱을 열지 않고 놓아둡니다. 하나를 끝낸 뒤 전환 회고에서 다시 만나요.")
    static let openAppWhenRun = false

    @Parameter(title: "생각", requestValueDialog: IntentDialog("무슨 생각이 떠올랐어요?"))
    var text: String

    init() {}

    init(text: String) {
        self.text = text
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        GardenStore.shared().update { DayEngine.capture(&$0, text, now: .now) }
        WidgetCenter.shared.reloadAllTimelines()
        return .result(dialog: "놓아뒀어요. 지금의 하나로 돌아가요.")
    }
}

/// 앱의 쏟아내기 입력을 바로 연다 (제어 센터·잠금화면 컨트롤, 액션 버튼).
struct OpenCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "쏟아내기 열기"
    static let description = IntentDescription("앱의 쏟아내기 입력을 바로 엽니다.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: AppConstants.appGroup)?.set(true, forKey: AppConstants.pendingCaptureKey)
        return .result()
    }
}
