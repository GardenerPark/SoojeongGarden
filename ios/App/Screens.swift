// 하루 루프 화면: 아침 쏟아내기 → 오늘의 하나 → 다음 하나 ⇄ 지금 → 전환 회고 → 하루 마무리.

import SwiftUI

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView {
            Group {
                switch model.phase {
                case .morning: MorningView()
                case .next: NextView()
                case .focus: FocusView()
                case .review: ReviewView()
                case .closed: ClosedView()
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $model.showCapture) { CaptureSheet() }
        .alert("알림", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("확인", role: .cancel) {}
        } message: {
            Text(model.error ?? "")
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.reload() }
        }
    }
}

// MARK: 아침 쏟아내기 + 오늘의 하나

struct MorningView: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var speech = SpeechInput()
    @State private var draft = ""
    @State private var picking = false
    @FocusState private var focused: Bool

    var body: some View {
        if picking {
            PickView(picking: $picking)
        } else {
            VStack(alignment: .leading, spacing: 20) {
                Label12("\(dateLabel(model.today)) · 아침")
                Text("머릿속에 있는 걸\n전부 꺼내 보세요").font(.snTitle)
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(model.state.thoughts(.morning, on: model.today)) { t in
                        Text(t.text).font(.title3)
                    }
                }
                TextField("한 줄 적고 return", text: $draft, axis: .vertical)
                    .font(.title3)
                    .padding(14)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.primary, lineWidth: 2))
                    .focused($focused)
                    .submitLabel(.return)
                    .onChange(of: draft) { _, value in
                        // 여러 줄 입력칸에서 return을 누르면 한 줄씩 저장한다.
                        guard value.hasSuffix("\n") else { return }
                        submit()
                    }
                Text("return을 누르면 한 줄씩 저장돼요.").font(.footnote).foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    RoundIconButton(systemImage: speech.isListening ? "stop.fill" : "mic", label: speech.isListening ? "듣기 멈추기" : "말로 적기", filled: false, active: speech.isListening) {
                        let base = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        speech.toggle { said in draft = [base, said].filter { !$0.isEmpty }.joined(separator: " ") }
                    }
                    PrimaryButton(title: "오늘의 하나 정하기") {
                        speech.stop()
                        submit()
                        picking = true
                    }
                }
            }
            .onAppear { focused = true }
            .onChange(of: speech.error) { _, e in if let e { model.error = e } }
        }
    }

    private func submit() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { draft = ""; return }
        if model.addThought(text) { draft = "" }
    }
}

struct PickView: View {
    @EnvironmentObject var model: AppModel
    @Binding var picking: Bool
    @State private var one = ""
    @State private var some1 = ""
    @State private var some2 = ""

    private var options: [Thought] { model.state.thoughts(.morning, on: model.today) + model.state.thoughts(.kept) }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Label12(dateLabel(model.today))
            Text("오늘의 하나는?").font(.snTitle)
            VStack(alignment: .leading, spacing: 8) {
                Label12("오늘의 하나 · 필수")
                field("예: 유튜브 촬영", $one, strong: true)
            }
            VStack(alignment: .leading, spacing: 8) {
                Label12("썸 · 최대 2개")
                field("예: 필라테스", $some1)
                field("", $some2)
            }
            if !options.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label12("아침 기록과 보관함에서 고르기")
                    FlowLayout {
                        ForEach(options) { t in
                            Chip(text: t.text, on: [one, some1, some2].contains(t.text)) { fill(t.text) }
                        }
                    }
                }
            }
            PrimaryButton(title: "이걸로 시작", disabled: one.trimmingCharacters(in: .whitespaces).isEmpty) {
                if model.setOne(one, some: [some1, some2]) { picking = false }
            }
            Button("더 쏟아내기") { picking = false }.font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity)
        }
    }

    private func field(_ placeholder: String, _ text: Binding<String>, strong: Bool = false) -> some View {
        TextField(placeholder, text: text)
            .font(strong ? .title3.weight(.semibold) : .title3)
            .padding(14)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(strong ? Color.primary : Color(.separator), lineWidth: strong ? 2 : 1))
    }

    private func fill(_ text: String) {
        if one == text { one = ""; return }
        if some1 == text { some1 = ""; return }
        if some2 == text { some2 = ""; return }
        if one.isEmpty { one = text } else if some1.isEmpty { some1 = text } else if some2.isEmpty { some2 = text } else {
            model.error = "오늘의 하나 1개와 썸 2개까지 고를 수 있어요."
        }
    }
}

// MARK: 다음 하나

struct NextView: View {
    @EnvironmentObject var model: AppModel
    @State private var declaration = ""
    @State private var related = true
    @State private var fromId: String?
    @State private var confirmClose = false

    var body: some View {
        let finished = model.day.finished.count
        let candidates = model.state.thoughts(.now)
        let recent = model.state.recentBlocks()
        VStack(alignment: .leading, spacing: 20) {
            Label12("\(dateLabel(model.today)) · 끝낸 하나 \(finished)개")
            Text(finished == 0 ? "첫 번째 하나는?" : "다음 하나는?").font(.snTitle)
            VStack(alignment: .leading, spacing: 8) {
                Label12("무엇을, 얼마나")
                TextField("예: 촬영 대본 정리 90분", text: $declaration)
                    .font(.title3.weight(.semibold))
                    .padding(14)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.primary, lineWidth: 2))
                    .submitLabel(.go)
                    .onSubmit(start)
                Toggle("오늘의 하나를 위한 블록", isOn: $related).tint(.primary)
            }
            if !candidates.isEmpty {
                group("지금 하기로 고른 것", candidates.map { t -> (String, String?, Bool) in (t.text, t.id, true) })
            }
            if !model.day.some.isEmpty {
                group("썸", model.day.some.map { s -> (String, String?, Bool) in (s, nil, false) })
            }
            if !recent.isEmpty {
                group("최근 블록 다시 시작", recent.map { b -> (String, String?, Bool) in (b.minutes.map { "\(b.title) \($0)분" } ?? b.title, nil, b.related) })
            }
            HStack(spacing: 12) {
                PrimaryButton(title: "시작", disabled: declaration.trimmingCharacters(in: .whitespaces).isEmpty, action: start)
                RoundIconButton(systemImage: "plus", label: "쏟아내기", filled: false) { model.showCapture = true }
            }
            Button("오늘 마무리하기") { confirmClose = true }.font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity)
            OneAnchor(one: model.day.one)
        }
        .confirmationDialog("오늘을 마무리할까요?", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("마무리") { model.closeDay() }
        } message: {
            Text("거르지 않은 생각은 내일 아침 보관함으로 가요.")
        }
    }

    private func group(_ title: String, _ items: [(String, String?, Bool)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label12(title)
            FlowLayout {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    Chip(text: item.0) {
                        declaration = item.0
                        fromId = item.1
                        related = item.2
                    }
                }
            }
        }
    }

    private func start() {
        let text = declaration.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        if model.start(text, related: related, fromId: fromId) {
            declaration = ""
            fromId = nil
            related = true
        }
    }
}

// MARK: 지금

struct FocusView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        if let block = model.day.active {
            VStack(alignment: .leading, spacing: 20) {
                Label12("지금 · \(block.startedAt.hhmm) 시작")
                VStack(alignment: .leading, spacing: 14) {
                    Text(block.related ? "오늘의 하나를 위한 블록" : "오늘의 하나와 다른 블록")
                        .font(.footnote)
                        .foregroundStyle(block.related ? Color.primary : Color.secondary)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .overlay(Capsule().stroke(block.related ? Color.primary : Color(.separator)))
                    Text(block.title).font(.snBig)
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        timer(block, now: context.date)
                    }
                }
                .frame(minHeight: 360)
                HStack(spacing: 12) {
                    PrimaryButton(title: "끝냈어요") { model.end() }
                    RoundIconButton(systemImage: "plus", label: "쏟아내기") { model.showCapture = true }
                }
                OneAnchor(one: model.day.one)
            }
        }
    }

    @ViewBuilder
    private func timer(_ block: Block, now: Date) -> some View {
        let sec = max(0, Int(now.timeIntervalSince(block.startedAt)))
        if let minutes = block.minutes {
            let total = minutes * 60
            VStack(alignment: .leading, spacing: 10) {
                Text(sec <= total ? Self.mmss(total - sec) : "+" + Self.mmss(sec - total)).font(.snTimer).monospacedDigit()
                ProgressView(value: Double(min(sec, total)), total: Double(total)).tint(.primary)
                Text(sec <= total ? "\(minutes)분 중 \(sec / 60)분 · 지금은 이것만" : "예정한 \(minutes)분이 지났어요. 끝났으면 끝냈어요를 눌러요.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text(Self.mmss(sec)).font(.snTimer).monospacedDigit()
                Text("끝났다고 할 때까지 열어 둘게요.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    static func mmss(_ sec: Int) -> String { String(format: "%02d:%02d", sec / 60, sec % 60) }
}

// MARK: 쏟아내기

struct CaptureSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var speech = SpeechInput()
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label12("떠오른 생각을 던지세요")
            TextField("", text: $text, axis: .vertical)
                .lineLimit(3...6)
                .font(.title3)
                .padding(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.primary, lineWidth: 2))
                .focused($focused)
            HStack(spacing: 12) {
                PrimaryButton(title: "던지기", disabled: text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
                    speech.stop()
                    if model.addThought(text) { dismiss() }
                }
                RoundIconButton(systemImage: speech.isListening ? "stop.fill" : "mic", label: speech.isListening ? "듣기 멈추기" : "말로 적기", filled: false, active: speech.isListening) {
                    let base = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    speech.toggle { said in text = [base, said].filter { !$0.isEmpty }.joined(separator: " ") }
                }
            }
            Text("던지면 바로 돌아가요. 분류도 확인도 없어요.").font(.footnote).foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.medium])
        .onAppear { focused = true }
        .onDisappear { speech.stop() }
        .onChange(of: speech.error) { _, e in if let e { model.error = e } }
    }
}

// MARK: 전환 회고

struct ReviewView: View {
    @EnvironmentObject var model: AppModel
    @State private var note = ""
    @State private var confirmClose = false

    var body: some View {
        let review = model.state.thoughts(.inbox)
        VStack(alignment: .leading, spacing: 20) {
            if let block = model.state.lastEnded(on: model.today) {
                Label12("블록 끝 · \(block.startedAt.hhmm)–\(block.endedAt?.hhmm ?? "")")
                Text(block.title).font(.snTitle)
                VStack(alignment: .leading, spacing: 8) {
                    Label12("어디까지 했나요")
                    TextField("예: 구조 완성, 숫자는 다음 블록에서", text: $note)
                        .padding(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(.separator)))
                        .onAppear { note = block.note }
                        .onSubmit { model.note(block.id, note) }
                }
            }
            if let t = review.first {
                HStack {
                    Label12("쏟아낸 것 거르기 · 기준은 오늘의 하나")
                    Spacer()
                    Text("\(review.count)개 남음").font(.footnote).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 14) {
                    Text(t.text).font(.title3.weight(.semibold))
                    HStack(spacing: 8) {
                        sortButton("지금", t.id, .now, filled: true)
                        sortButton("보관", t.id, .keep)
                        sortButton("지우기", t.id, .drop)
                    }
                }
                .padding(18)
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(.separator)))
            } else {
                Text("거를 생각이 없어요. 다음 하나로 넘어가요.").font(.footnote).foregroundStyle(.secondary)
            }
            PrimaryButton(title: "다음 하나 정하기") {
                saveNote()
                model.finishReview()
            }
            Button("오늘은 여기까지") { confirmClose = true }.font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity)
            OneAnchor(one: model.day.one)
        }
        .confirmationDialog("오늘을 마무리할까요?", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("마무리") { saveNote(); model.closeDay() }
        } message: {
            Text("거르지 않은 생각은 내일 아침 보관함으로 가요.")
        }
    }

    private func saveNote() {
        if let block = model.state.lastEnded(on: model.today), note != block.note { model.note(block.id, note) }
    }

    private func sortButton(_ title: String, _ id: String, _ action: SortAction, filled: Bool = false) -> some View {
        Button { model.sort(id, action) } label: {
            Text(title).font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(filled ? Color(.systemBackground) : Color.primary)
                .background(RoundedRectangle(cornerRadius: 12).fill(filled ? Color.primary : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(filled ? Color.primary : Color(.separator)))
        }
    }
}

// MARK: 하루 마무리

struct ClosedView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        let s = model.state.summary(on: model.today)
        VStack(alignment: .leading, spacing: 20) {
            Label12("\(dateLabel(model.today)) · 마무리")
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(s.finishedCount)").font(.system(size: 72, weight: .bold, design: .serif))
                Text("개의 하나를 끝냈어요").font(.headline)
            }
            if let one = s.one {
                Text("그중 **\(s.relatedCount)블록**이 오늘의 하나, \(one)에").font(.subheadline).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(s.finished) { b in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(b.startedAt.hhmm).font(.snLabel).foregroundStyle(.secondary).frame(width: 44, alignment: .leading)
                        Text(b.title).fontWeight(b.related ? .semibold : .regular).foregroundStyle(b.related ? Color.primary : Color.secondary)
                    }
                    .padding(.vertical, 8)
                    .padding(.leading, 14)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(b.related ? Color.primary : Color(.separator)).frame(width: 3)
                    }
                }
            }
            if !s.carried.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Label12("내일 아침 보관함으로 · \(s.carried.count)개")
                    FlowLayout { ForEach(s.carried) { Chip(text: $0.text) } }
                }
                .padding(16)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.separator), style: StrokeStyle(lineWidth: 1, dash: [4])))
            }
            Text("내일 아침에 다시 만나요.").font(.footnote).foregroundStyle(.secondary)
        }
    }
}
