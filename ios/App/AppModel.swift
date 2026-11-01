// 화면이 쓰는 상태. 모든 변경은 SharedStore.update를 거쳐 파일·위젯·Live Activity와 맞춘다.

import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var state = AppState()
    @Published private(set) var today = AppState.dayKey(Date())
    @Published var error: String?
    @Published var showCapture = false

    var phase: Phase { state.phase(on: today) }
    var day: Day { state.day(today) }

    init() { reload() }

    func reload() {
        let snap = SharedStore.snapshot()
        state = snap.state
        today = snap.today
        if UserDefaults(suiteName: SharedStore.appGroup)?.bool(forKey: OpenCaptureIntent.flagKey) == true {
            UserDefaults(suiteName: SharedStore.appGroup)?.set(false, forKey: OpenCaptureIntent.flagKey)
            if [.focus, .next, .review].contains(phase) { showCapture = true }
        }
        FocusLiveActivity.sync(day: day)
    }

    /// 바꾸고 다시 읽는다. 실패하면 안내 문구를 띄우고 false.
    @discardableResult
    func perform(_ body: (inout AppState, Date, String) throws -> Void) -> Bool {
        do {
            try SharedStore.update(body)
            reload()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: 동작

    func addThought(_ text: String) -> Bool {
        perform { s, now, today in try s.addThought(text, now: now, today: today) }
    }

    func setOne(_ one: String, some: [String]) -> Bool {
        let chosen = Set([one] + some)
        let ids = Set((state.thoughts(.morning, on: today) + state.thoughts(.kept)).filter { chosen.contains($0.text) }.map(\.id))
        return perform { s, _, today in try s.setOne(one, some: some, fromIds: ids, today: today) }
    }

    func start(_ declaration: String, related: Bool, fromId: String?) -> Bool {
        perform { s, now, today in try s.startBlock(declaration, related: related, fromId: fromId, now: now, today: today) }
    }

    func end() { perform { s, now, today in try s.endBlock(now: now, today: today) } }

    func note(_ id: String, _ text: String) { perform { s, _, today in s.noteBlock(id, note: text, today: today) } }

    func sort(_ id: String, _ action: SortAction) { perform { s, _, _ in try s.sort(id, action) } }

    func finishReview() { perform { s, _, today in s.finishReview(today: today) } }

    func closeDay() { perform { s, now, today in s.closeDay(now: now, today: today) } }
}
