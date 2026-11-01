// Signal & Noise 하루 규칙. signal-noise/core.js와 같은 규칙을 Swift로 옮겼다.
//  - 오늘의 하나: 아침에 정하는 하루의 기준. 하루에 하나.
//  - 블록: 지금 실제로 하는 일. 한 번에 하나만, 하루에 몇 개든.
//  - 쏟아낸 생각: morning(아침) → inbox(집중 중) → now / kept(보관함) / dropped. 고른 것은 picked.

import Foundation

struct Thought: Codable, Identifiable, Hashable {
    enum Status: String, Codable { case morning, inbox, now, kept, dropped, picked }
    var id: String
    var text: String
    var status: Status
    var date: String
    var createdAt: Date
}

struct Block: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var minutes: Int?
    var related: Bool
    var startedAt: Date
    var endedAt: Date?
    var note: String = ""
    var auto: Bool = false

    var endsAt: Date? { minutes.map { startedAt.addingTimeInterval(TimeInterval($0 * 60)) } }
}

struct Day: Codable, Hashable {
    var one: String?
    var some: [String] = []
    var blocks: [Block] = []
    var reviewing = false
    var closedAt: Date?

    var active: Block? { blocks.first { $0.endedAt == nil } }
    var finished: [Block] { blocks.filter { $0.endedAt != nil && !$0.auto } }
}

enum Phase: Equatable { case morning, focus, review, next, closed }

enum SortAction: String, CaseIterable { case now, keep, drop }

struct SNError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct DaySummary {
    var date: String
    var one: String?
    var finished: [Block]
    var relatedCount: Int
    var carried: [Thought]
    var finishedCount: Int { finished.count }
}

struct AppState: Codable {
    static let maxSome = 2
    static let maxText = 2000

    var seq = 0
    var days: [String: Day] = [:]
    var thoughts: [Thought] = []

    // MARK: 날짜

    static func dayKey(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    func day(_ key: String) -> Day { days[key] ?? Day() }

    private mutating func nextId(_ prefix: String) -> String {
        seq += 1
        return "\(prefix)\(seq)"
    }

    private static func clean(_ text: String, _ what: String) throws -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { throw SNError("\(what)을 적어 주세요.") }
        return String(t.prefix(maxText))
    }

    // MARK: 읽기

    func phase(on date: String) -> Phase {
        let d = day(date)
        if d.closedAt != nil { return .closed }
        if d.one == nil { return .morning }
        if d.active != nil { return .focus }
        return d.reviewing ? .review : .next
    }

    func thoughts(_ status: Thought.Status, on date: String? = nil) -> [Thought] {
        thoughts.filter { $0.status == status && (date == nil || $0.date == date) }
    }

    func lastEnded(on date: String) -> Block? { day(date).blocks.last { $0.endedAt != nil } }

    func summary(on date: String) -> DaySummary {
        let d = day(date)
        return DaySummary(
            date: date,
            one: d.one,
            finished: d.finished,
            relatedCount: d.finished.filter(\.related).count,
            carried: thoughts(.kept, on: date)
        )
    }

    func recentBlocks(limit: Int = 4) -> [Block] {
        let all = days.values.flatMap(\.blocks).filter { $0.endedAt != nil }.sorted { $0.startedAt > $1.startedAt }
        var seen = Set<String>()
        var out: [Block] = []
        for b in all where !seen.contains(b.title) {
            seen.insert(b.title)
            out.append(b)
            if out.count == limit { break }
        }
        return out
    }

    // MARK: 쓰기

    /// 지난 날짜에 남은 것을 정리한다: 열린 블록은 자동 종료(끝낸 수에서 제외), 거르지 않은 생각은 보관함으로.
    mutating func rollover(now: Date, today: String) {
        for key in days.keys where key < today {
            if let i = days[key]!.blocks.firstIndex(where: { $0.endedAt == nil }) {
                days[key]!.blocks[i].endedAt = now
                days[key]!.blocks[i].auto = true
            }
            days[key]!.reviewing = false
        }
        for i in thoughts.indices where thoughts[i].date < today && [.morning, .inbox, .now].contains(thoughts[i].status) {
            thoughts[i].status = .kept
        }
    }

    @discardableResult
    mutating func addThought(_ text: String, now: Date, today: String) throws -> Thought {
        let t = Thought(
            id: nextId("t"),
            text: try Self.clean(text, "생각"),
            status: day(today).one == nil ? .morning : .inbox,
            date: today,
            createdAt: now
        )
        thoughts.append(t)
        return t
    }

    mutating func setOne(_ one: String, some: [String], fromIds: Set<String>, today: String) throws {
        var d = day(today)
        guard d.closedAt == nil else { throw SNError("오늘은 이미 마무리했어요.") }
        let list = some.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard list.count <= Self.maxSome else { throw SNError("썸은 \(Self.maxSome)개까지 정할 수 있어요.") }
        d.one = try Self.clean(one, "오늘의 하나")
        d.some = list
        days[today] = d
        for i in thoughts.indices {
            if fromIds.contains(thoughts[i].id), thoughts[i].status != .dropped {
                thoughts[i].status = .picked
            } else if thoughts[i].date == today, thoughts[i].status == .morning {
                thoughts[i].status = .kept // 뽑히지 않은 아침 생각은 보관함으로
            }
        }
    }

    @discardableResult
    mutating func startBlock(_ declaration: String, related: Bool, fromId: String? = nil, now: Date, today: String) throws -> Block {
        var d = day(today)
        guard d.closedAt == nil else { throw SNError("오늘은 이미 마무리했어요.") }
        guard d.one != nil else { throw SNError("먼저 오늘의 하나를 정해 주세요.") }
        if let open = d.active { throw SNError("지금 하는 블록이 있어요: \(open.title). 끝낸 뒤에 다음 하나를 시작해요.") }
        let parsed = Self.parseDeclaration(declaration)
        let block = Block(
            id: nextId("b"),
            title: try Self.clean(parsed.title, "블록 이름"),
            minutes: parsed.minutes,
            related: related,
            startedAt: now
        )
        d.blocks.append(block)
        d.reviewing = false
        days[today] = d
        if let fromId, let i = thoughts.firstIndex(where: { $0.id == fromId }), thoughts[i].status != .dropped {
            thoughts[i].status = .picked
        }
        return block
    }

    @discardableResult
    mutating func endBlock(note: String? = nil, now: Date, today: String) throws -> Block {
        var d = day(today)
        guard let i = d.blocks.firstIndex(where: { $0.endedAt == nil }) else { throw SNError("지금 하는 블록이 없어요.") }
        d.blocks[i].endedAt = now
        if let note { d.blocks[i].note = String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxText)) }
        d.reviewing = true
        days[today] = d
        return d.blocks[i]
    }

    mutating func noteBlock(_ id: String, note: String, today: String) {
        guard let i = days[today]?.blocks.firstIndex(where: { $0.id == id }) else { return }
        days[today]!.blocks[i].note = String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxText))
    }

    mutating func sort(_ id: String, _ action: SortAction) throws {
        guard let i = thoughts.firstIndex(where: { $0.id == id }) else { throw SNError("그 생각을 찾지 못했어요.") }
        switch action {
        case .now: thoughts[i].status = .now
        case .keep: thoughts[i].status = .kept
        case .drop: thoughts[i].status = .dropped
        }
    }

    mutating func finishReview(today: String) {
        var d = day(today)
        d.reviewing = false
        days[today] = d
    }

    @discardableResult
    mutating func closeDay(now: Date, today: String) -> DaySummary {
        var d = day(today)
        if d.closedAt == nil {
            if let i = d.blocks.firstIndex(where: { $0.endedAt == nil }) { d.blocks[i].endedAt = now }
            d.reviewing = false
            d.closedAt = now
            days[today] = d
            for i in thoughts.indices where [.morning, .inbox, .now].contains(thoughts[i].status) {
                thoughts[i].status = .kept // 남은 것은 내일 아침 보관함으로
            }
        }
        return summary(on: today)
    }

    // MARK: 말로 한 선언

    /// "필라테스 2시간", "제안서 1장 구조 잡기, 90분", "촬영 1시간 반" → (이름, 분)
    static func parseDeclaration(_ text: String) -> (title: String, minutes: Int?) {
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var rest = raw
        var minutes = 0.0

        func take(_ pattern: String) -> [String]? {
            guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
                  let m = re.firstMatch(in: rest, range: NSRange(rest.startIndex..., in: rest))
            else { return nil }
            var groups: [String] = []
            for i in 0..<m.numberOfRanges {
                if let r = Range(m.range(at: i), in: rest) { groups.append(String(rest[r])) } else { groups.append("") }
            }
            if let whole = Range(m.range, in: rest) { rest.replaceSubrange(whole, with: " ") }
            return groups
        }

        if let g = take(#"(\d+(?:\.\d+)?)\s*시간\s*반"#) {
            minutes += (Double(g[1]) ?? 0) * 60 + 30
        } else if let g = take(#"(\d+(?:\.\d+)?)\s*(?:시간|h(?:ours?|rs?)?(?![a-z]))"#) {
            minutes += (Double(g[1]) ?? 0) * 60
        }
        if let g = take(#"(\d+)\s*(?:분|m(?:in(?:ute)?s?)?(?![a-z]))"#) {
            minutes += Double(g[1]) ?? 0
        }

        var title = rest.replacingOccurrences(of: #"\s(동안|짜리)(?=\s|$)"#, with: " ", options: .regularExpression)
        title = title.replacingOccurrences(of: #"["“”]"#, with: "", options: .regularExpression)
        title = title.replacingOccurrences(of: #"^[\s,·-]+|[\s,·-]+$"#, with: "", options: .regularExpression)
        title = title.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        let mins = minutes > 0 ? min(720, Int(minutes.rounded())) : nil
        return (title.isEmpty ? raw : title, mins)
    }
}
