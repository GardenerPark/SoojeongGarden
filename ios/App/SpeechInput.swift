// 말하는 동안 인식된 글자를 바로 돌려주는 음성 입력. 가능하면 기기 안에서만 인식한다.

import AVFoundation
import Speech
import SwiftUI

@MainActor
final class SpeechInput: ObservableObject {
    @Published private(set) var isListening = false
    @Published var error: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ko-KR"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    /// 다시 부르면 멈춘다. onText는 지금까지 들은 전체 문장을 계속 받는다.
    func toggle(onText: @escaping (String) -> Void) {
        if isListening { stop(); return }
        Task {
            guard await Self.authorize() else {
                error = "설정 → 개인정보 보호에서 마이크와 음성 인식을 허용해 주세요."
                return
            }
            do { try start(onText: onText) } catch {
                self.error = "음성 인식을 시작하지 못했어요."
                stop()
            }
        }
    }

    func stop() {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func start(onText: @escaping (String) -> Void) throws {
        guard let recognizer, recognizer.isAvailable else { throw SNError("음성 인식을 쓸 수 없어요.") }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        self.request = request

        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        engine.prepare()
        try engine.start()
        isListening = true

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                if let result { onText(result.bestTranscription.formattedString) }
                if error != nil || result?.isFinal == true { self?.stop() }
            }
        }
    }

    private static func authorize() async -> Bool {
        let speech = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}
