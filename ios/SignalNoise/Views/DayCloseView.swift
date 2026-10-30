import SignalNoiseCore
import SwiftUI

/// 하루 마무리: 끝낸 하나들이 순서대로 이어진 한 줄 기록.
struct DayCloseView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let day = model.today
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    DaySummary(day: day)

                    let leftovers = DayEngine.leftoverCount(day)
                    if leftovers > 0 {
                        Label("남은 생각 \(leftovers)개는 내일 아침 보관함에서 다시 만나요", systemImage: "tray")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if day.currentBlock != nil {
                        Label("진행 중인 블록은 지금 시각으로 끝나요", systemImage: "clock")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(20)
            }
            .navigationTitle("하루 마무리")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    haptic(.medium)
                    model.closeToday()
                } label: {
                    Text("오늘 하루 닫기").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.ink)
                .padding()
                .background(Color(uiColor: .systemBackground))
            }
        }
    }
}

/// 마무리 화면과 닫힌 하루 화면이 같이 쓰는 기록
struct DaySummary: View {
    let day: Day

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("끝낸 하나").font(.subheadline).foregroundStyle(.secondary)
                Text("\(day.doneCount)개").font(.system(size: 48, weight: .bold, design: .rounded))
                if let one = day.theOne {
                    Label(one, systemImage: day.theOneDone ? "checkmark.seal.fill" : "scope")
                        .foregroundStyle(day.theOneDone ? Color.primary : Color.secondary)
                }
            }

            if day.finishedBlocks.isEmpty {
                Text("아직 끝낸 블록이 없어요. 괜찮아요, 내일 아침 다시 시작해요.")
                    .foregroundStyle(.secondary)
            } else {
                // 한 줄 기록: 하나 끝내고 다음 하나
                Text(day.finishedBlocks.map(\.title).joined(separator: "  →  "))
                    .font(.headline)

                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(day.finishedBlocks.enumerated()), id: \.element.id) { index, block in
                        HStack(alignment: .top, spacing: 12) {
                            VStack(spacing: 0) {
                                Circle()
                                    .fill(block.isTheOne ? Color.primary : Color.secondary.opacity(0.5))
                                    .frame(width: 10, height: 10)
                                    .padding(.top, 5)
                                if index < day.finishedBlocks.count - 1 {
                                    Rectangle().fill(Color.secondary.opacity(0.3)).frame(width: 2)
                                }
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(block.title).font(.body.weight(.semibold))
                                Text("\(Format.time.string(from: block.startedAt)) · \(Format.duration(block))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if !block.note.isEmpty {
                                    Text(block.note).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                            .padding(.bottom, 16)
                        }
                    }
                }
            }
        }
    }
}

/// 닫힌 하루. 쏟아내기는 여전히 열려 있고, 내일 아침 보관함으로 간다.
struct ClosedView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(Format.dayTitle.string(from: .now)).font(.subheadline).foregroundStyle(.secondary)
                Text("오늘도 하나씩 해냈어요").font(.title2.bold())
                DaySummary(day: model.today)
                Text("새벽 4시가 지나면 새 하루가 시작돼요.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .overlay(alignment: .bottomTrailing) {
            CaptureButton { model.showCapture = true }.padding(20)
        }
    }
}
