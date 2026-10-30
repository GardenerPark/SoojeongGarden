import SignalNoiseCore
import SwiftUI

/// 아침 쏟아내기: 열자마자 입력 상태. 저장 버튼 없음 (쓰는 대로 저장된다).
struct MorningView: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var speech = SpeechInput()
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(Format.dayTitle.string(from: .now))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("떠오르는 대로 쏟아내세요")
                .font(.title2.bold())

            TextEditor(text: $text)
                .focused($focused)
                .font(.body)
                .scrollContentBackground(.hidden)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("걱정, 할 일, 기분, 아무거나")
                            .foregroundStyle(.tertiary)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                }
                .dictation(speech, into: $text)

            HStack(spacing: 12) {
                MicButton(speech: speech)
                if !model.state.inbox.isEmpty {
                    Label("보관함 \(model.state.inbox.count)", systemImage: "tray")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    speech.stop()
                    model.mutate { DayEngine.finishMorning(&$0) }
                } label: {
                    Text("오늘의 하나 정하기").padding(.horizontal, 6)
                }
                .buttonStyle(.ink)
            }
        }
        .padding(20)
        .onAppear {
            text = model.today.morningNotes
            focused = true
        }
        .onChange(of: text) { _, new in
            model.mutate(reloadWidgets: false) { DayEngine.setMorningNotes(&$0, new) }
        }
    }
}
