// signal-noise/test/core.test.js와 같은 규칙을 Swift 쪽에서 확인한다.

import XCTest
@testable import SignalNoise

final class CoreTests: XCTestCase {
    private let seoul = TimeZone(identifier: "Asia/Seoul")!
    private func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

    func testParseDeclaration() {
        XCTAssertEqual(AppState.parseDeclaration("필라테스 2시간").title, "필라테스")
        XCTAssertEqual(AppState.parseDeclaration("필라테스 2시간").minutes, 120)
        XCTAssertEqual(AppState.parseDeclaration("제안서 1장 구조 잡기, 90분").title, "제안서 1장 구조 잡기")
        XCTAssertEqual(AppState.parseDeclaration("제안서 1장 구조 잡기, 90분").minutes, 90)
        XCTAssertEqual(AppState.parseDeclaration("촬영 1시간 반").minutes, 90)
        XCTAssertEqual(AppState.parseDeclaration("편집 1시간 20분").minutes, 80)
        XCTAssertEqual(AppState.parseDeclaration("deep work 45 min").title, "deep work")
        XCTAssertNil(AppState.parseDeclaration("아침 루틴").minutes)
        XCTAssertNil(AppState.parseDeclaration("5 mangoes 사기").minutes)
    }

    func testDayLoop() throws {
        var s = AppState()
        let now = date("2026-10-31T00:00:00Z")
        let today = AppState.dayKey(now, timeZone: seoul)
        XCTAssertEqual(s.phase(on: today), .morning)

        let a = try s.addThought("유튜브 촬영", now: now, today: today)
        try s.addThought("필라테스 예약", now: now, today: today)
        try s.setOne("유튜브 촬영", some: ["필라테스"], fromIds: [a.id], today: today)
        XCTAssertEqual(s.phase(on: today), .next)
        XCTAssertEqual(s.thoughts(.kept).map(\.text), ["필라테스 예약"])

        try s.startBlock("촬영 대본 정리 90분", related: true, now: now, today: today)
        XCTAssertEqual(s.phase(on: today), .focus)
        XCTAssertThrowsError(try s.startBlock("메일 10분", related: false, now: now, today: today))

        let idea = try s.addThought("썸네일 문구", now: now, today: today)
        XCTAssertEqual(idea.status, .inbox)
        try s.endBlock(now: now, today: today)
        XCTAssertEqual(s.phase(on: today), .review)
        try s.sort(idea.id, .now)
        s.finishReview(today: today)

        try s.startBlock("필라테스 2시간", related: false, now: now, today: today)
        try s.endBlock(now: now, today: today)
        let summary = s.closeDay(now: now, today: today)
        XCTAssertEqual(summary.finishedCount, 2)
        XCTAssertEqual(summary.relatedCount, 1)
        XCTAssertEqual(s.phase(on: today), .closed)
        XCTAssertTrue(s.thoughts(.kept).map(\.text).contains("썸네일 문구"))
    }

    func testRolloverClosesOpenBlockWithoutCounting() throws {
        var s = AppState()
        let start = date("2026-10-31T01:00:00Z")
        let day1 = AppState.dayKey(start, timeZone: seoul)
        try s.setOne("촬영", some: [], fromIds: [], today: day1)
        try s.startBlock("촬영 2시간", related: true, now: start, today: day1)
        try s.addThought("조명 사기", now: start, today: day1)

        let next = date("2026-10-31T16:00:00Z")
        let day2 = AppState.dayKey(next, timeZone: seoul)
        XCTAssertEqual(day2, "2026-11-01")
        s.rollover(now: next, today: day2)
        XCTAssertEqual(s.phase(on: day2), .morning)
        XCTAssertEqual(s.thoughts(.kept).map(\.text), ["조명 사기"])
        XCTAssertEqual(s.summary(on: day1).finishedCount, 0)
    }
}
