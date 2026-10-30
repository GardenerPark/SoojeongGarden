import Foundation

/// 하루 루프의 규칙. 화면과 저장 방식에 상관없이 상태만 바꾼다.
///
/// 아침 쏟아내기 → 오늘의 하나 → (블록 시작 → 쏟아내기 → 전환 회고)* → 하루 마무리 → 다음 날 아침
public enum DayEngine {
    public static let maxThumbs = 2
    /// 새벽 4시 전까지는 전날로 친다 (늦은 밤 마무리가 다음 날로 넘어가지 않게)
    public static let dayStartHour = 4

    public static func dayKey(for date: Date, calendar: Calendar = .current) -> String {
        let shifted = calendar.date(byAdding: .hour, value: -dayStartHour, to: date) ?? date
        let c = calendar.dateComponents([.year, .month, .day], from: shifted)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// 오늘 날짜의 Day를 준비한다. 날이 바뀌었으면 어제를 닫아 남은 것을 보관함으로 보낸다.
    public static func ensureToday(_ state: inout GardenState, now: Date, calendar: Calendar = .current) {
        let key = dayKey(for: now, calendar: calendar)
        if state.todayKey == key, state.days[key] != nil { return }
        if let previous = state.todayKey, previous != key {
            closeDay(&state, key: previous, now: now)
        }
        if state.days[key] == nil { state.days[key] = Day(key: key) }
        state.todayKey = key
    }

    // MARK: 아침

    public static func setMorningNotes(_ state: inout GardenState, _ text: String) {
        mutateToday(&state) { $0.morningNotes = text }
    }

    public static func finishMorning(_ state: inout GardenState) {
        mutateToday(&state) { $0.morningDone = true }
    }

    /// 오늘의 하나를 정하는 화면에서 아침 쏟아내기로 돌아간다
    public static func reopenMorning(_ state: inout GardenState) {
        mutateToday(&state) { $0.morningDone = false }
    }

    /// 오늘의 하나(필수)와 썸(최대 2개)을 정한다. 보관함에서 고른 항목은 보관함에서 빠진다.
    @discardableResult
    public static func chooseTheOne(_ state: inout GardenState, theOne: String, thumbs: [String],
                                    usedInboxIDs: Set<UUID> = []) -> Bool {
        let one = clean(theOne)
        guard !one.isEmpty else { return false }
        let cleanedThumbs = thumbs.map(clean).filter { !$0.isEmpty && $0 != one }
        mutateToday(&state) { day in
            day.theOne = one
            day.morningDone = true
            day.thumbs = Array(cleanedThumbs.prefix(maxThumbs))
        }
        state.inbox.removeAll { usedInboxIDs.contains($0.id) }
        return true
    }

    public static func removeFromInbox(_ state: inout GardenState, id: UUID) {
        state.inbox.removeAll { $0.id == id }
    }

    // MARK: 쏟아내기

    /// 분류도 제목도 묻지 않는다. 빈 입력만 무시한다.
    @discardableResult
    public static func capture(_ state: inout GardenState, _ text: String, now: Date,
                               calendar: Calendar = .current) -> Thought? {
        let t = clean(text)
        guard !t.isEmpty else { return nil }
        ensureToday(&state, now: now, calendar: calendar)
        var thought = Thought(text: t, createdAt: now)
        if state.today?.closed == true {
            // 이미 닫은 하루라면 내일 아침 보관함으로 바로 보낸다
            thought.status = .archived
            state.inbox.append(thought)
        } else {
            mutateToday(&state) { $0.thoughts.append(thought) }
        }
        return thought
    }

    // MARK: 블록

    /// 지금의 블록은 하나뿐이다. 이미 진행 중이면 시작하지 않는다.
    @discardableResult
    public static func startBlock(_ state: inout GardenState, declaration: String, now: Date,
                                  isTheOne: Bool? = nil, fromSignal signalID: UUID? = nil,
                                  parsed: DeclarationParser.Result? = nil) -> Block? {
        guard let day = state.today, day.currentBlock == nil, !day.closed else { return nil }
        let parsed = parsed ?? DeclarationParser.parse(declaration)
        guard !parsed.title.isEmpty else { return nil }
        let forTheOne = isTheOne ?? matchesTheOne(parsed.title, theOne: day.theOne)
        let block = Block(title: parsed.title, plannedMinutes: parsed.minutes, startedAt: now, isTheOne: forTheOne)
        mutateToday(&state) { day in
            day.blocks.append(block)
            // 다음 하나로 고른 시그널은 이제 블록이 되었으니 정리한다
            if let signalID { day.thoughts.removeAll { $0.id == signalID } }
        }
        return block
    }

    /// 블록을 끝낸다. 끝낸 순간이 전환 회고의 시작이다.
    @discardableResult
    public static func finishCurrentBlock(_ state: inout GardenState, now: Date) -> Block? {
        guard let current = state.today?.currentBlock else { return nil }
        var finished = current
        finished.endedAt = max(now, current.startedAt)
        mutateToday(&state) { day in
            if let i = day.blocks.firstIndex(where: { $0.id == current.id }) { day.blocks[i] = finished }
        }
        return finished
    }

    public static func setNote(_ state: inout GardenState, blockID: UUID, note: String) {
        mutateToday(&state) { day in
            if let i = day.blocks.firstIndex(where: { $0.id == blockID }) {
                day.blocks[i].note = note.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }

    public static func setTheOneDone(_ state: inout GardenState, _ done: Bool) {
        mutateToday(&state) { $0.theOneDone = done }
    }

    // MARK: 전환 회고

    public enum Triage: Sendable { case now, archive, delete }

    /// 쏟아낸 것 하나를 지금 / 보관 / 지우기로 가른다. 보관은 바로 보관함으로 간다.
    public static func triage(_ state: inout GardenState, thoughtID: UUID, _ decision: Triage) {
        guard let day = state.today, let thought = day.thoughts.first(where: { $0.id == thoughtID }) else { return }
        switch decision {
        case .now:
            mutateToday(&state) { day in
                if let i = day.thoughts.firstIndex(where: { $0.id == thoughtID }) { day.thoughts[i].status = .signal }
            }
        case .archive:
            mutateToday(&state) { $0.thoughts.removeAll { $0.id == thoughtID } }
            var archived = thought
            archived.status = .archived
            state.inbox.append(archived)
        case .delete:
            mutateToday(&state) { $0.thoughts.removeAll { $0.id == thoughtID } }
        }
    }

    public struct Candidate: Hashable, Sendable {
        public enum Kind: Hashable, Sendable { case theOne, signal(UUID), thumb }
        public let text: String
        public let kind: Kind
    }

    /// 다음 하나 후보: 남은 오늘의 하나, 회고에서 "지금"으로 고른 것, 썸 순서.
    public static func nextCandidates(_ day: Day) -> [Candidate] {
        var out: [Candidate] = []
        func add(_ s: String, _ kind: Candidate.Kind) {
            let c = clean(s)
            if !c.isEmpty, !out.contains(where: { $0.text == c }) { out.append(Candidate(text: c, kind: kind)) }
        }
        if let one = day.theOne, !day.theOneDone { add(one, .theOne) }
        day.signals.forEach { add($0.text, .signal($0.id)) }
        day.thumbs.forEach { add($0, .thumb) }
        return out
    }

    // MARK: 하루 마무리

    /// 하루를 닫는다. 진행 중 블록은 끝내고, 거르지 않은 것과 남은 시그널은 내일 아침 보관함으로 보낸다.
    public static func closeDay(_ state: inout GardenState, key: String, now: Date) {
        guard var day = state.days[key], !day.closed else { return }
        if let i = day.blocks.firstIndex(where: { $0.isRunning }) {
            day.blocks[i].endedAt = max(now, day.blocks[i].startedAt)
        }
        let leftovers = day.thoughts.filter { $0.status != .archived }
        state.inbox.append(contentsOf: leftovers.map { var t = $0; t.status = .archived; return t })
        day.thoughts.removeAll()
        day.closed = true
        state.days[key] = day
    }

    public static func closeToday(_ state: inout GardenState, now: Date) {
        guard let key = state.todayKey else { return }
        closeDay(&state, key: key, now: now)
    }

    /// 하루 마무리 화면에서 보여줄, 내일 아침 보관함으로 갈 개수
    public static func leftoverCount(_ day: Day) -> Int {
        day.thoughts.filter { $0.status != .archived }.count
    }

    // MARK: 내부

    static func mutateToday(_ state: inout GardenState, _ body: (inout Day) -> Void) {
        guard let key = state.todayKey, var day = state.days[key] else { return }
        body(&day)
        state.days[key] = day
    }

    static func clean(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func matchesTheOne(_ title: String, theOne: String?) -> Bool {
        guard let theOne, !theOne.isEmpty else { return false }
        let a = normalize(title), b = normalize(theOne)
        guard !a.isEmpty, !b.isEmpty else { return false }
        return a == b || a.contains(b) || b.contains(a)
    }

    static func normalize(_ s: String) -> String {
        s.lowercased().filter { !$0.isWhitespace && !$0.isPunctuation }
    }
}
