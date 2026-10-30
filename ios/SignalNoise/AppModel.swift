import Foundation
import SignalNoiseCore
import SwiftUI
import WidgetKit

/// 화면이 보는 상태. 모든 변경은 GardenStore를 거쳐 위젯·단축어와 공유된다.
@MainActor
final class AppModel: ObservableObject {
    enum Route { case morning, theOne, now, closed }

    @Published private(set) var state = GardenState()
    @Published var showCapture = false
    /// 방금 끝낸 블록. 값이 있으면 전환 회고가 열린다.
    @Published var reviewingBlock: Block?
    @Published var showDayClose = false

    let store: GardenStore

    init(store: GardenStore = .shared()) {
        self.store = store
        refresh()
    }

    var today: Day { state.today ?? Day(key: DayEngine.dayKey(for: .now)) }

    var route: Route {
        let day = today
        if day.closed { return .closed }
        if !day.morningDone { return .morning }
        if day.theOne == nil { return .theOne }
        return .now
    }

    /// 앱이 앞으로 올 때마다: 날짜를 맞추고, 앱 밖에서 쏟아낸 것을 다시 읽는다.
    func refresh() {
        mutate { DayEngine.ensureToday(&$0, now: .now) }
        let defaults = UserDefaults(suiteName: AppConstants.appGroup)
        if defaults?.bool(forKey: AppConstants.pendingCaptureKey) == true {
            defaults?.set(false, forKey: AppConstants.pendingCaptureKey)
            showCapture = true
        }
    }

    func mutate(reloadWidgets: Bool = true, _ body: (inout GardenState) -> Void) {
        let (newState, _) = store.update(body)
        guard newState != state else { return }
        state = newState
        if reloadWidgets { WidgetCenter.shared.reloadAllTimelines() }
    }

    func handle(url: URL) {
        guard url.scheme == AppConstants.urlScheme else { return }
        switch url.host {
        case "capture": showCapture = true
        default: break
        }
    }

    // MARK: 동작

    func capture(_ text: String) {
        mutate { DayEngine.capture(&$0, text, now: .now) }
    }

    func start(_ declaration: String, fromSignal: UUID? = nil, isTheOne: Bool? = nil) {
        let startedAt = Date.now
        Task {
            let parsed = await Suggester.block(from: declaration)
            mutate {
                DayEngine.startBlock(&$0, declaration: declaration, now: startedAt, isTheOne: isTheOne,
                                     fromSignal: fromSignal, parsed: parsed)
            }
        }
    }

    /// 말로 한 선언으로 시작한다. 회고에서 "지금"으로 고른 생각이면 그 생각은 블록이 된다.
    func startDeclared(_ declaration: String) {
        var signalID: UUID?
        for c in DayEngine.nextCandidates(today) where declaration.hasPrefix(c.text) {
            if case .signal(let id) = c.kind { signalID = id; break }
        }
        start(declaration, fromSignal: signalID)
    }

    func finishCurrentBlock() {
        var finished: Block?
        mutate { finished = DayEngine.finishCurrentBlock(&$0, now: .now) }
        reviewingBlock = finished
    }

    func closeToday() {
        mutate { DayEngine.closeToday(&$0, now: .now) }
        showDayClose = false
    }
}
