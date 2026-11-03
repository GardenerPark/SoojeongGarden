import Foundation

/// 쏟아낸 생각 하나. 전환 회고에서만 거른다.
public struct Thought: Codable, Identifiable, Hashable, Sendable {
    public enum Status: String, Codable, Sendable {
        case pending   // 아직 거르지 않음 (집중 중에는 보이지 않는다)
        case signal    // 회고에서 "지금"으로 고름 → 다음 하나 후보
        case archived  // 보관 → 다음 날 아침 보관함에서 다시 만난다
    }

    public let id: UUID
    public var text: String
    public var createdAt: Date
    public var status: Status

    public init(id: UUID = UUID(), text: String, createdAt: Date, status: Status = .pending) {
        self.id = id
        self.text = text
        self.createdAt = createdAt
        self.status = status
    }
}

/// 말로 시작을 선언한 블록 하나. 화면에는 항상 이것 하나만 보인다.
public struct Block: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public var title: String
    public var plannedMinutes: Int?
    public var startedAt: Date
    public var endedAt: Date?
    /// 전환 회고에서 적은 상태 한 줄
    public var note: String
    /// 오늘의 하나를 위한 블록인지
    public var isTheOne: Bool

    public var isRunning: Bool { endedAt == nil }

    public init(id: UUID = UUID(), title: String, plannedMinutes: Int?, startedAt: Date,
                endedAt: Date? = nil, note: String = "", isTheOne: Bool = false) {
        self.id = id
        self.title = title
        self.plannedMinutes = plannedMinutes
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.note = note
        self.isTheOne = isTheOne
    }
}

public struct Day: Codable, Hashable, Sendable {
    public var key: String
    /// 아침 쏟아내기 원문 (그날의 기록으로 남는다)
    public var morningNotes: String = ""
    public var morningDone: Bool = false
    public var theOne: String?
    public var theOneDone: Bool = false
    /// 오늘의 하나 외 부가 우선순위, 최대 2개
    public var thumbs: [String] = []
    public var blocks: [Block] = []
    public var thoughts: [Thought] = []
    public var closed: Bool = false

    public init(key: String) { self.key = key }

    public var currentBlock: Block? { blocks.last(where: { $0.isRunning }) }
    public var finishedBlocks: [Block] { blocks.filter { !$0.isRunning } }
    /// 북극성 지표: 하루에 끝낸 하나의 수
    public var doneCount: Int { finishedBlocks.count }
    public var pendingThoughts: [Thought] { thoughts.filter { $0.status == .pending } }
    public var signals: [Thought] { thoughts.filter { $0.status == .signal } }
}

public struct GardenState: Codable, Hashable, Sendable {
    public var todayKey: String?
    public var days: [String: Day] = [:]
    /// 보관함: 다음 날 아침 오늘의 하나를 정할 때 다시 만난다
    public var inbox: [Thought] = []

    public init() {}

    public var today: Day? {
        guard let todayKey else { return nil }
        return days[todayKey]
    }
}
