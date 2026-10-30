import SignalNoiseCore
import SwiftUI

/// 쏟아내기 입력: 적고 나면 바로 지금 화면으로. 쏟아낸 목록은 여기서 보여주지 않는다.
struct CaptureSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speech = SpeechInput()
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                TextField("떠오른 생각", text: $text)
                    .font(.title3)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(save)
                MicButton(speech: speech)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            // 말을 멈추면 그대로 놓아둔다 (확인 버튼 없음)
            .dictation(speech, into: $text) { _ in save() }

            Text("놓아두면 하나를 끝낸 뒤에 다시 만나요.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(20)
        .onAppear { focused = true }
        .onDisappear {
            speech.stop()
            save()
        }
    }

    private func save() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        text = ""
        guard !t.isEmpty else {
            dismiss()
            return
        }
        model.capture(t)
        haptic(.soft)
        dismiss()
    }
}
