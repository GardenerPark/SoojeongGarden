import SignalNoiseCore
import SwiftUI

enum Format {
    static let dayTitle: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "M월 d일 EEEE"
        return f
    }()

    static let time: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "a h:mm"
        return f
    }()

    static func minutes(_ m: Int) -> String {
        switch (m / 60, m % 60) {
        case (0, let min): return "\(min)분"
        case (let h, 0): return "\(h)시간"
        case (let h, let min): return "\(h)시간 \(min)분"
        }
    }

    static func duration(_ block: Block) -> String {
        let end = block.endedAt ?? .now
        return minutes(max(1, Int(end.timeIntervalSince(block.startedAt) / 60)))
    }
}

/// 화면 아래에 항상 보이는 오늘의 하나
struct TheOneBar: View {
    let day: Day

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: day.theOneDone ? "checkmark.seal.fill" : "scope")
                .foregroundStyle(.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("오늘의 하나").font(.caption).foregroundStyle(.secondary)
                Text(day.theOne ?? "")
                    .font(.subheadline.weight(.semibold))
                    .strikethrough(day.theOneDone)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.primary.opacity(0.15)))
        .accessibilityElement(children: .combine)
    }
}

/// 다음 하나 후보를 한 번에 고르는 칩
struct CandidateChips: View {
    let candidates: [DayEngine.Candidate]
    let onPick: (DayEngine.Candidate) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(candidates, id: \.self) { c in
                    Button {
                        onPick(c)
                    } label: {
                        Label(c.text, systemImage: icon(c.kind))
                            .font(.subheadline)
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.primary.opacity(0.06), in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.primary, lineWidth: c.kind == .theOne ? 1 : 0))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func icon(_ kind: DayEngine.Candidate.Kind) -> String {
        switch kind {
        case .theOne: return "scope"
        case .signal: return "dot.radiowaves.left.and.right"
        case .thumb: return "hand.thumbsup"
        }
    }
}

/// 말로 시작을 선언하는 입력. "필라테스 2시간"
struct DeclareField: View {
    @Binding var text: String
    @StateObject private var speech = SpeechInput()
    var placeholder = "예: 기획서 초안 2시간"
    let onStart: () -> Void

    private var preview: DeclarationParser.Result { DeclarationParser.parse(text) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                TextField(placeholder, text: $text)
                    .font(.title3)
                    .submitLabel(.go)
                    .onSubmit { if !preview.title.isEmpty { onStart() } }
                MicButton(speech: speech)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .dictation(speech, into: $text)

            HStack {
                if !preview.title.isEmpty {
                    Text(preview.minutes.map { "\(preview.title) · \(Format.minutes($0))" } ?? "\(preview.title) · 끝날 때까지")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("시작", action: onStart)
                    .buttonStyle(.ink)
                    .disabled(preview.title.isEmpty)
            }
        }
    }
}

/// 받아쓰기 결과를 입력 칸에 이어 붙인다
struct DictationModifier: ViewModifier {
    @ObservedObject var speech: SpeechInput
    @Binding var text: String
    var onFinish: ((String) -> Void)?
    @State private var base = ""

    func body(content: Content) -> some View {
        content
            .onChange(of: speech.isRecording) { _, recording in
                if recording {
                    base = text
                } else if !speech.transcript.isEmpty {
                    onFinish?(text)
                }
            }
            .onChange(of: speech.transcript) { _, t in
                guard !t.isEmpty else { return }
                text = base.isEmpty ? t : base + (base.hasSuffix("\n") ? "" : " ") + t
            }
    }
}

extension View {
    func dictation(_ speech: SpeechInput, into text: Binding<String>, onFinish: ((String) -> Void)? = nil) -> some View {
        modifier(DictationModifier(speech: speech, text: text, onFinish: onFinish))
    }
}

/// 흑백 버튼: 채운 것(검정 바탕·흰 글씨, 다크 모드에선 반대)과 테두리만 있는 것
struct InkButtonStyle: ButtonStyle {
    var filled = true

    func makeBody(configuration: Configuration) -> some View {
        InkButton(configuration: configuration, filled: filled)
    }

    private struct InkButton: View {
        let configuration: ButtonStyle.Configuration
        let filled: Bool
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.body.weight(.semibold))
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .foregroundStyle(filled ? Color(.systemBackground) : Color.primary)
                .background(filled ? Color.primary : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.primary, lineWidth: filled ? 0 : 1))
                .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.3)
        }
    }
}

extension ButtonStyle where Self == InkButtonStyle {
    static var ink: InkButtonStyle { InkButtonStyle() }
    static var inkOutline: InkButtonStyle { InkButtonStyle(filled: false) }
}

func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
    UIImpactFeedbackGenerator(style: style).impactOccurred()
}
