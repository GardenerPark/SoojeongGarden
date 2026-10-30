import XCTest
@testable import SignalNoiseCore

final class DeclarationParserTests: XCTestCase {
    func testKoreanDurations() {
        XCTAssertEqual(DeclarationParser.parse("필라테스 2시간"), .init(title: "필라테스", minutes: 120))
        XCTAssertEqual(DeclarationParser.parse("기획서 초안 45분 동안"), .init(title: "기획서 초안", minutes: 45))
        XCTAssertEqual(DeclarationParser.parse("한 시간 반 동안 독서"), .init(title: "독서", minutes: 90))
        XCTAssertEqual(DeclarationParser.parse("메일 정리 1시간 30분"), .init(title: "메일 정리", minutes: 90))
        XCTAssertEqual(DeclarationParser.parse("반 시간 산책"), .init(title: "산책", minutes: 30))
        XCTAssertEqual(DeclarationParser.parse("1.5시간 코딩"), .init(title: "코딩", minutes: 90))
    }

    func testEnglishDurations() {
        XCTAssertEqual(DeclarationParser.parse("deep work 1h30m"), .init(title: "deep work", minutes: 90))
        XCTAssertEqual(DeclarationParser.parse("email 25 min"), .init(title: "email", minutes: 25))
    }

    func testNoDurationStaysOpen() {
        XCTAssertEqual(DeclarationParser.parse("지금 이메일 정리 시작"), .init(title: "이메일 정리", minutes: nil))
        XCTAssertEqual(DeclarationParser.parse("독서할게"), .init(title: "독서", minutes: nil))
    }

    func testDurationOnlyHasNoTitle() {
        XCTAssertEqual(DeclarationParser.parse("2시간").title, "")
    }
}

final class RelevanceTests: XCTestCase {
    func testSharedWordIsRelated() {
        XCTAssertTrue(Relevance.isRelated("기획서에 경쟁사 표 넣기", to: "투자 기획서 초안"))
    }

    func testUnrelated() {
        XCTAssertFalse(Relevance.isRelated("우유 사기", to: "투자 기획서 초안"))
        XCTAssertFalse(Relevance.isRelated("아무거나", to: nil))
    }
}

final class DayEngineTests: XCTestCase {
    var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }()

    func date(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    func testDayStartsAtFourAM() {
        XCTAssertEqual(DayEngine.dayKey(for: date(30, 2), calendar: calendar), "2026-10-29")
        XCTAssertEqual(DayEngine.dayKey(for: date(30, 4), calendar: calendar), "2026-10-30")
    }

    func testOneLoop() {
        var s = GardenState()
        DayEngine.ensureToday(&s, now: date(30, 7), calendar: calendar)
        DayEngine.setMorningNotes(&s, "어제 잘 못 잤다. 기획서가 걱정된다.")
        XCTAssertTrue(DayEngine.chooseTheOne(&s, theOne: "투자 기획서 초안", thumbs: ["필라테스", "", "장보기", "세번째"]))
        XCTAssertEqual(s.today?.thumbs, ["필라테스", "장보기"])

        let block = DayEngine.startBlock(&s, declaration: "투자 기획서 초안 2시간", now: date(30, 9))
        XCTAssertEqual(block?.plannedMinutes, 120)
        XCTAssertEqual(block?.isTheOne, true)
        // 지금의 블록은 하나뿐
        XCTAssertNil(DayEngine.startBlock(&s, declaration: "딴 일", now: date(30, 9, 30)))

        let a = DayEngine.capture(&s, "경쟁사 표", now: date(30, 9, 10), calendar: calendar)!
        let b = DayEngine.capture(&s, "우유 사기", now: date(30, 9, 20), calendar: calendar)!
        let c = DayEngine.capture(&s, "엄마 생신 선물", now: date(30, 9, 40), calendar: calendar)!
        XCTAssertNil(DayEngine.capture(&s, "   ", now: date(30, 9, 41), calendar: calendar))

        DayEngine.finishCurrentBlock(&s, now: date(30, 11))
        XCTAssertEqual(s.today?.doneCount, 1)
        XCTAssertEqual(s.today?.pendingThoughts.count, 3)

        DayEngine.triage(&s, thoughtID: a.id, .now)
        DayEngine.triage(&s, thoughtID: b.id, .delete)
        DayEngine.triage(&s, thoughtID: c.id, .archive)
        XCTAssertEqual(s.today?.pendingThoughts.count, 0)
        XCTAssertEqual(s.inbox.map(\.text), ["엄마 생신 선물"])

        let candidates = DayEngine.nextCandidates(s.today!).map(\.text)
        XCTAssertEqual(candidates, ["투자 기획서 초안", "경쟁사 표", "필라테스", "장보기"])

        DayEngine.startBlock(&s, declaration: "경쟁사 표 30분", now: date(30, 11, 5), fromSignal: a.id)
        XCTAssertTrue(s.today!.signals.isEmpty)
        DayEngine.capture(&s, "치과 예약", now: date(30, 11, 10), calendar: calendar)

        // 하루 마무리: 진행 중 블록은 끝나고, 남은 것은 보관함으로
        DayEngine.closeToday(&s, now: date(30, 22))
        XCTAssertEqual(s.today?.doneCount, 2)
        XCTAssertEqual(s.today?.closed, true)
        XCTAssertEqual(s.inbox.map(\.text), ["엄마 생신 선물", "치과 예약"])

        // 닫은 뒤에 쏟아낸 것도 잃지 않는다
        DayEngine.capture(&s, "자기 전 떠오른 것", now: date(30, 23), calendar: calendar)
        XCTAssertEqual(s.inbox.last?.text, "자기 전 떠오른 것")
        XCTAssertNil(DayEngine.startBlock(&s, declaration: "야근", now: date(30, 23)))
    }

    func testNextMorningClosesYesterdayAndKeepsInbox() {
        var s = GardenState()
        DayEngine.ensureToday(&s, now: date(29, 8), calendar: calendar)
        DayEngine.chooseTheOne(&s, theOne: "하나", thumbs: [])
        let t = DayEngine.capture(&s, "남은 생각", now: date(29, 10), calendar: calendar)!

        DayEngine.ensureToday(&s, now: date(30, 7), calendar: calendar)
        XCTAssertEqual(s.todayKey, "2026-10-30")
        XCTAssertEqual(s.days["2026-10-29"]?.closed, true)
        XCTAssertNil(s.today?.theOne)
        XCTAssertEqual(s.inbox.map(\.id), [t.id])

        // 보관함에서 고른 것은 보관함에서 빠진다
        DayEngine.chooseTheOne(&s, theOne: "남은 생각", thumbs: [], usedInboxIDs: [t.id])
        XCTAssertTrue(s.inbox.isEmpty)
    }

    func testWidgetSnapshotHidesStaleDay() {
        var s = GardenState()
        DayEngine.ensureToday(&s, now: date(29, 8), calendar: calendar)
        DayEngine.chooseTheOne(&s, theOne: "어제의 하나", thumbs: [])
        XCTAssertEqual(WidgetSnapshot(state: s, now: date(29, 9), calendar: calendar).theOne, "어제의 하나")
        XCTAssertNil(WidgetSnapshot(state: s, now: date(30, 9), calendar: calendar).theOne)
    }

    func testStoreRoundTrip() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("garden-\(UUID()).json")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = GardenStore(fileURL: url)
        store.update { s in
            DayEngine.ensureToday(&s, now: date(30, 8), calendar: calendar)
            DayEngine.capture(&s, "생각", now: date(30, 8), calendar: calendar)
        }
        XCTAssertEqual(GardenStore(fileURL: url).load().today?.thoughts.map(\.text), ["생각"])
    }
}
