import SignalNoiseCore
import SwiftUI

/// 전환 회고: 상태를 적고 → 쏟아낸 것을 하나씩 거르고 → 다음 하나를 정한다.
/// 거르는 기준은 오늘의 하나다. AI는 관련 있어 보이는지만 먼저 표시하고, 고르는 건 사용자다.
struct TransitionView: View {
    enum Step { case status, filter, next }

    @EnvironmentObject private var model: AppModel
    let finished: Block

    @State private var step: Step = .status
    @State private var note = ""
    @State private var theOneDone = false
    @State private var total = 0
    @State private var related: [UUID: Bool] = [:]
    @State private var declaration = ""

    private var day: Day { model.today }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .status: statusStep
                case .filter: filterStep
                case .next: nextStep
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .navigationTitle("전환 회고")
            .navigationBarTitleDisplayMode(.inline)
            .animation(.easeInOut(duration: 0.2), value: step)
        }
        .onAppear {
            theOneDone = day.theOneDone
            total = day.pendingThoughts.count
        }
        .task { await suggest() }
    }

    // MARK: 1. 상태

    private var statusStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("하나 끝!").font(.subheadline).foregroundStyle(.secondary)
                Text(finished.title).font(.title.bold())
                Text(Format.duration(finished)).font(.subheadline).foregroundStyle(.secondary)
            }

            TextField("지금 상태 한 줄 (선택)", text: $note, axis: .vertical)
                .padding(14)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            if !day.theOneDone, day.theOne != nil {
                Toggle(isOn: $theOneDone) {
                    VStack(alignment: .leading) {
                        Text("오늘의 하나를 끝냈어요")
                        Text(day.theOne ?? "").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()
            primaryButton(total > 0 ? "쏟아낸 것 거르기 · \(total)" : "다음 하나 정하기") {
                model.mutate {
                    DayEngine.setNote(&$0, blockID: finished.id, note: note)
                    if theOneDone { DayEngine.setTheOneDone(&$0, true) }
                }
                step = total > 0 ? .filter : .next
            }
        }
    }

    // MARK: 2. 거르기

    @ViewBuilder
    private var filterStep: some View {
        if let thought = day.pendingThoughts.first {
            let isRelated = related[thought.id] ?? false
            VStack(alignment: .leading, spacing: 18) {
                Text("\(total - day.pendingThoughts.count + 1) / \(total)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 12) {
                    Text(thought.text)
                        .font(.title2.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let suggestion = related[thought.id] {
                        Label(suggestion ? "오늘의 하나와 관련 있어 보여요" : "오늘의 하나와는 거리가 있어 보여요",
                              systemImage: suggestion ? "sparkles" : "moon.zzz")
                            .font(.footnote)
                            .foregroundStyle(suggestion ? Color.accentColor : Color.secondary)
                    }
                    Text(Format.time.string(from: thought.createdAt))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(20)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .id(thought.id)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))

                Spacer()

                HStack(spacing: 10) {
                    triageButton("지금", "bolt.fill", prominent: isRelated) { decide(thought, .now) }
                    triageButton("보관", "tray.and.arrow.down", prominent: !isRelated) { decide(thought, .archive) }
                    triageButton("지우기", "trash", prominent: false, role: .destructive) { decide(thought, .delete) }
                }
                Text("지금: 다음 하나 후보 · 보관: 내일 아침 보관함")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        } else {
            Color.clear.onAppear { step = .next }
        }
    }

    private func decide(_ thought: Thought, _ decision: DayEngine.Triage) {
        haptic()
        withAnimation {
            model.mutate { DayEngine.triage(&$0, thoughtID: thought.id, decision) }
        }
        if day.pendingThoughts.isEmpty { step = .next }
    }

    private func suggest() async {
        for t in day.pendingThoughts {
            let answer = await Suggester.isRelated(t.text, to: day.theOne)
            related[t.id] = answer
        }
    }

    // MARK: 3. 다음 하나

    private var nextStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("다음 하나는?").font(.title.bold())
            CandidateChips(candidates: DayEngine.nextCandidates(day)) { declaration = $0.text }
            DeclareField(text: $declaration) {
                model.startDeclared(declaration)
                model.reviewingBlock = nil
            }
            Spacer()
            HStack {
                Button("잠깐 쉬기") { model.reviewingBlock = nil }
                Spacer()
                Button("하루 마무리") {
                    model.reviewingBlock = nil
                    // 회고 시트가 내려간 뒤에 마무리 시트를 연다
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { model.showDayClose = true }
                }
            }
            .font(.subheadline)
        }
    }

    // MARK: 버튼

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
    }

    @ViewBuilder
    private func triageButton(_ title: String, _ icon: String, prominent: Bool,
                              role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        let button = Button(role: role, action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                Text(title).font(.subheadline.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
        if prominent {
            button.buttonStyle(.borderedProminent)
        } else {
            button.buttonStyle(.bordered)
        }
    }
}
