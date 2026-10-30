import AVFoundation
import Speech
import SwiftUI

/// 말로 쏟아내기 / 말로 시작 선언. 한국어 받아쓰기, 가능하면 기기 안에서만 처리한다.
@MainActor
final class SpeechInput: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var transcript = ""
    @Published private(set) var denied = false

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ko-KR"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func toggle() {
        isRecording ? stop() : start()
    }

    func start() {
        guard !isRecording else { return }
        transcript = ""
        Task {
            guard await Self.authorize() else {
                denied = true
                return
            }
            do {
                try begin()
            } catch {
                stop()
            }
        }
    }

    func stop() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        request = nil
        task?.cancel()
        task = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func begin() throws {
        guard let recognizer, recognizer.isAvailable else { throw CancellationError() }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        self.request = request

        let input = audioEngine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        audioEngine.prepare()
        try audioEngine.start()
        isRecording = true

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            Task { @MainActor in
                guard let self else { return }
                if let text { self.transcript = text }
                if error != nil || isFinal { self.stop() }
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

/// 마이크 버튼. 녹음 중에는 채워진 원으로 바뀐다.
struct MicButton: View {
    @ObservedObject var speech: SpeechInput

    var body: some View {
        Button {
            speech.toggle()
        } label: {
            Image(systemName: speech.isRecording ? "waveform.circle.fill" : "mic.circle")
                .font(.system(size: 30))
                .symbolEffect(.pulse, isActive: speech.isRecording)
                .foregroundStyle(speech.isRecording ? Color.accentColor : Color.secondary)
        }
        .accessibilityLabel(speech.isRecording ? "받아쓰기 멈추기" : "말로 하기")
    }
}
