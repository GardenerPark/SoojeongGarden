// 앱, 위젯, 단축어(App Intents)가 같이 쓰는 저장소. 기록 전체를 앱 그룹 폴더의 JSON 파일 하나로 둔다.
// 매 작업마다 파일을 새로 읽고 쓰므로, 단축어가 앱 밖에서 던진 생각도 그대로 이어진다.

import Foundation
import WidgetKit

enum SharedStore {
    static let appGroup = "group.com.soojeonggarden.signalnoise"

    static var fileURL: URL {
        let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("store.json")
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private static let lock = NSLock()

    static func read() -> AppState {
        guard let data = try? Data(contentsOf: fileURL), let state = try? decoder.decode(AppState.self, from: data) else {
            return AppState()
        }
        return state
    }

    /// 읽고, 지난 날짜를 정리하고, 바꾸고, 저장한다. 위젯도 새로 그린다.
    @discardableResult
    static func update<T>(now: Date = Date(), _ body: (inout AppState, Date, String) throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }
        let today = AppState.dayKey(now)
        var state = read()
        state.rollover(now: now, today: today)
        let result = try body(&state, now, today)
        let data = try encoder.encode(state)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        WidgetCenter.shared.reloadAllTimelines()
        return result
    }

    /// 화면에서 쓸 오늘 기준 상태. 지난 날짜 정리는 저장하지 않고 보이기만 한다.
    static func snapshot(now: Date = Date()) -> (state: AppState, today: String) {
        let today = AppState.dayKey(now)
        var state = read()
        state.rollover(now: now, today: today)
        return (state, today)
    }
}
