import Foundation

/// 앱·위젯·단축어(App Intent)가 함께 쓰는 저장소. App Group 폴더의 JSON 파일 하나.
///
/// 앱이 떠 있지 않을 때 Siri나 액션 버튼으로 쏟아낸 것도 같은 파일에 쓰이므로,
/// 바꿀 때는 항상 디스크에서 새로 읽고 → 바꾸고 → 바로 쓴다.
public final class GardenStore: @unchecked Sendable {
    public let fileURL: URL
    private let lock = NSLock()

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    /// App Group이 설정되지 않은 환경(미리보기, 테스트)에서는 임시 폴더를 쓴다.
    public static func shared(appGroup: String = AppConstants.appGroup) -> GardenStore {
        let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
            ?? FileManager.default.temporaryDirectory
        return GardenStore(fileURL: base.appendingPathComponent("garden.json"))
    }

    public func load() -> GardenState {
        lock.lock(); defer { lock.unlock() }
        return read()
    }

    @discardableResult
    public func update<T>(_ body: (inout GardenState) -> T) -> (GardenState, T) {
        lock.lock(); defer { lock.unlock() }
        var state = read()
        let result = body(&state)
        write(state)
        return (state, result)
    }

    private func read() -> GardenState {
        guard let data = try? Data(contentsOf: fileURL) else { return GardenState() }
        return (try? Self.decoder.decode(GardenState.self, from: data)) ?? GardenState()
    }

    private func write(_ state: GardenState) {
        guard let data = try? Self.encoder.encode(state) else { return }
        try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: fileURL, options: .atomic)
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

public enum AppConstants {
    /// Xcode에서 App Group을 바꾸면 여기도 같이 바꾼다
    public static let appGroup = "group.com.soojeong.signalnoise"
    public static let urlScheme = "signalnoise"
    public static let widgetKind = "TheOneWidget"
    public static let captureWidgetKind = "CaptureWidget"
    /// 앱 밖(제어 센터·액션 버튼)에서 "쏟아내기 열기"를 눌렀다는 표시
    public static let pendingCaptureKey = "pendingCapture"
}

/// 잠금화면 위젯이 보여줄 것: 오늘의 하나와 지금의 블록
public struct WidgetSnapshot: Equatable, Sendable {
    public var theOne: String?
    public var theOneDone: Bool
    public var currentTitle: String?
    public var currentStartedAt: Date?
    public var plannedMinutes: Int?
    public var doneCount: Int

    public init(theOne: String?, theOneDone: Bool = false, currentTitle: String? = nil,
                currentStartedAt: Date? = nil, plannedMinutes: Int? = nil, doneCount: Int = 0) {
        self.theOne = theOne
        self.theOneDone = theOneDone
        self.currentTitle = currentTitle
        self.currentStartedAt = currentStartedAt
        self.plannedMinutes = plannedMinutes
        self.doneCount = doneCount
    }

    public init(state: GardenState, now: Date, calendar: Calendar = .current) {
        // 날이 바뀌었는데 앱을 아직 열지 않았다면 어제 것을 보여주지 않는다
        let day = state.today.flatMap { $0.key == DayEngine.dayKey(for: now, calendar: calendar) ? $0 : nil }
        theOne = day?.theOne
        theOneDone = day?.theOneDone ?? false
        currentTitle = day?.currentBlock?.title
        currentStartedAt = day?.currentBlock?.startedAt
        plannedMinutes = day?.currentBlock?.plannedMinutes
        doneCount = day?.doneCount ?? 0
    }
}
