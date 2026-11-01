import SignalNoiseCore
import SwiftUI

/// 지금 (홈): 지금의 블록 하나만. 할 일 목록도, 쏟아낸 목록도 보여주지 않는다.
struct NowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var declaration = ""

    var body: some View {
        let day = model.today
        VStack(spacing: 0) {
            header(day)
            Spacer()
            if let block = day.currentBlock {
                CurrentBlockCard(block: block) {
                    haptic(.medium)
                    model.finishCurrentBlock()
                }
            } else {
                startPanel(day)
            }
            Spacer()
            HStack {
                Spacer()
                CaptureButton { model.showCapture = true }
            }
            .padding(.bottom, 12)
            TheOneBar(day: day)
        }
        .padding(20)
    }

    private func header(_ day: Day) -> some View {
        HStack {
            Text(Format.dayTitle.string(from: .now))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            if day.doneCount > 0 {
                Label("\(day.doneCount)", systemImage: "checkmark.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .accessibilityLabel("끝낸 하나 \(day.doneCount)개")
            }
            Button {
                model.showDayClose = true
            } label: {
                Image(systemName: "moon")
            }
            .accessibilityLabel("하루 마무리")
            .padding(.leading, 8)
        }
    }

    private func startPanel(_ day: Day) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(day.doneCount == 0 ? "첫 번째 하나를 시작해요" : "다음 하나는?")
                .font(.title2.bold())
            CandidateChips(candidates: DayEngine.nextCandidates(day)) { c in
                declaration = c.text
            }
            DeclareField(text: $declaration) {
                haptic(.medium)
                model.startDeclared(declaration)
                declaration = ""
            }
        }
    }
}

struct CurrentBlockCard: View {
    let block: Block
    let onFinish: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Text(block.isTheOne ? "지금 · 오늘의 하나" : "지금")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            Text(block.title)
                .font(.largeTitle.bold())
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.6)

            TimelineView(.periodic(from: .now, by: 30)) { context in
                VStack(spacing: 6) {
                    Text(block.startedAt, style: .timer)
                        .font(.system(.title, design: .rounded).monospacedDigit())
                    if let planned = block.plannedMinutes {
                        let over = context.date.timeIntervalSince(block.startedAt) > Double(planned * 60)
                        Text(over ? "선언한 \(Format.minutes(planned))이 지났어요" : "선언한 시간 \(Format.minutes(planned))")
                            .font(.footnote)
                            .fontWeight(over ? .semibold : .regular)
                            .foregroundStyle(over ? Color.primary : Color.secondary)
                    }
                }
            }

            Button(action: onFinish) {
                Text("끝냈어요")
                    .font(.headline)
                    .frame(maxWidth: 220)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.ink)
        }
        .frame(maxWidth: .infinity)
    }
}

struct CaptureButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("생각 남기기", systemImage: "plus")
                .font(.headline)
                .foregroundStyle(Color(.systemBackground))
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(Color.primary, in: Capsule())
        }
        .accessibilityHint("떠오른 생각을 적어두고 지금 화면으로 돌아와요")
    }
}
