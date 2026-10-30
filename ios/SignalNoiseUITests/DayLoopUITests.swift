import XCTest

/// 하루 루프 한 바퀴를 실제 앱에서 돌린다.
/// CI에서는 이 테스트를 녹화해 데모 영상을 만들고, App Store 스크린샷을 찍는다.
final class DayLoopUITests: XCTestCase {
    private var app: XCUIApplication!
    /// 사람이 보기 좋은 속도로 천천히
    private let beat: TimeInterval = 1.2

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
    }

    func testOneDayLoop() {
        // ① 아침 쏟아내기: 열자마자 입력 상태
        let editor = app.textViews["morningEditor"]
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        editor.tap()
        pause()
        editor.typeText("어제 늦게 자서 좀 피곤하다.\n투자 기획서 초안을 오늘은 꼭 끝내고 싶다.\n필라테스도 가야 하고, 장도 봐야 한다.")
        shot("5-morning")
        tap(app.buttons["오늘의 하나 정하기"])

        // ② 오늘의 하나: 하나는 필수, 썸은 최대 2개
        let one = field("theOneField")
        tap(one)
        one.typeText("투자 기획서 초안")
        tap(field("thumb0"))
        field("thumb0").typeText("필라테스")
        tap(field("thumb1"))
        field("thumb1").typeText("장보기")
        pause()
        tap(app.buttons["이걸로 시작해요"])

        // ③ 지금: 말로 시작 선언
        let declare = field("declareField")
        tap(declare)
        declare.typeText("투자 기획서 초안 2시간\n")
        XCTAssertTrue(app.buttons["끝냈어요"].waitForExistence(timeout: 5))
        pause(2)
        shot("1-now")

        // ④ 집중 중 떠오른 생각: 한 번 누르고, 적고, 바로 복귀
        for thought in ["경쟁사 비교 표 넣기", "우유 사기", "엄마한테 전화"] {
            tap(app.buttons["생각 남기기"])
            let capture = field("captureField")
            XCTAssertTrue(capture.waitForExistence(timeout: 5))
            capture.typeText(thought + "\n")
            pause()
        }

        // ⑤ 끝냈어요 → 전환 회고
        tap(app.buttons["끝냈어요"])
        let note = field("noteField")
        tap(note)
        note.typeText("집중 잘 됨. 숫자 근거가 약함")
        pause()
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH '쏟아낸 것'")).firstMatch)

        // ⑥ 거르기: 지금 / 지우기 / 보관
        XCTAssertTrue(app.buttons["triage-지금"].waitForExistence(timeout: 5))
        pause(2)
        shot("2-review")
        tap(app.buttons["triage-지금"])
        tap(app.buttons["triage-지우기"])
        tap(app.buttons["triage-보관"])

        // ⑦ 다음 하나: "지금"으로 고른 생각으로 시작
        let next = field("declareField")
        tap(next)
        next.typeText("경쟁사 비교 표 넣기 30분\n")
        XCTAssertTrue(app.buttons["끝냈어요"].waitForExistence(timeout: 5))
        pause(2)
        tap(app.buttons["끝냈어요"])
        // 오늘의 하나를 끝냈어요 (스위치는 오른쪽 끝을 누른다)
        let toggle = app.switches.firstMatch
        if toggle.waitForExistence(timeout: 3) {
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        }
        pause()
        tap(app.buttons["다음 하나 정하기"])

        // ⑧ 하루 마무리
        tap(app.buttons["transitionDayClose"])
        XCTAssertTrue(app.buttons["오늘 하루 닫기"].waitForExistence(timeout: 5))
        pause(2)
        shot("3-dayclose")
        tap(app.buttons["오늘 하루 닫기"])
        pause(2)
        shot("4-closed")
    }

    // MARK: 도우미

    private func field(_ id: String) -> XCUIElement {
        let tf = app.textFields[id]
        if tf.waitForExistence(timeout: 3) { return tf }
        return app.textViews[id]
    }

    private func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 8), "없음: \(element)", file: file, line: line)
        element.tap()
        pause()
    }

    private func pause(_ beats: Double = 1) {
        Thread.sleep(forTimeInterval: beat * beats)
    }

    /// App Store 스크린샷. SCREENSHOT_DIR이 있으면 파일로도 저장한다.
    private func shot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}
