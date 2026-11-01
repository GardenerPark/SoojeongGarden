// 잠금화면 위젯(오늘의 하나 + 지금 블록), 쏟아내기 컨트롤, 지금 블록 Live Activity.

import AppIntents
import ActivityKit
import SwiftUI
import WidgetKit

@main
struct SignalNoiseWidgets: WidgetBundle {
    var body: some Widget {
        TodayOneWidget()
        CaptureControl()
        FocusActivityWidget()
    }
}

// MARK: 잠금화면 위젯

struct TodayEntry: TimelineEntry {
    let date: Date
    let one: String?
    let block: Block?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, one: "유튜브 촬영", block: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry(.now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        // 앱이 바꿀 때마다 다시 그리고, 자정이 지나면 새 날로 넘어가도록 다음 날 0시에 한 번 더 그린다.
        let now = Date.now
        let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(24 * 60 * 60 + 60)
        completion(Timeline(entries: [entry(now)], policy: .after(midnight)))
    }

    private func entry(_ now: Date) -> TodayEntry {
        let snap = SharedStore.snapshot(now: now)
        let day = snap.state.day(snap.today)
        return TodayEntry(date: now, one: day.closedAt == nil ? day.one : nil, block: day.active)
    }
}

struct TodayOneWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayOne", provider: TodayProvider()) { entry in
            TodayOneView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("오늘의 하나")
        .description("오늘의 하나와 지금 하는 블록을 잠금화면에 띄워요.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

struct TodayOneView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Text(entry.block?.title ?? entry.one ?? "오늘의 하나를 정해요")
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text("오늘의 하나").font(.caption2).foregroundStyle(.secondary)
                Text(entry.one ?? "아침에 정해요").font(.headline).lineLimit(2)
                if let block = entry.block {
                    Text("지금 · \(block.title)").font(.caption).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: 쏟아내기 컨트롤 (제어 센터, 잠금화면, 액션 버튼)

struct CaptureControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.soojeonggarden.signalnoise.capture") {
            ControlWidgetButton(action: OpenCaptureIntent()) {
                Label("쏟아내기", systemImage: "square.and.pencil")
            }
        }
        .displayName("쏟아내기")
        .description("앱을 열고 바로 쏟아내기 창을 띄워요.")
    }
}

// MARK: 지금 블록 Live Activity

struct FocusActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusAttributes.self) { context in
            FocusLockScreenView(attributes: context.attributes, state: context.state)
                .padding(16)
                .activityBackgroundTint(Color.black)
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("지금").font(.caption).foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusTimerText(state: context.state).font(.caption.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.title).font(.headline).lineLimit(1)
                        Text("오늘의 하나 · \(context.attributes.one)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "circle.fill").font(.caption2)
            } compactTrailing: {
                FocusTimerText(state: context.state).font(.caption2.monospacedDigit()).frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "circle.fill").font(.caption2)
            }
        }
    }
}

struct FocusTimerText: View {
    let state: FocusAttributes.ContentState
    var body: some View {
        if let endsAt = state.endsAt, endsAt > .now {
            Text(timerInterval: state.startedAt...endsAt, countsDown: true)
        } else {
            Text(state.startedAt, style: .timer)
        }
    }
}

struct FocusLockScreenView: View {
    let attributes: FocusAttributes
    let state: FocusAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(state.related ? "오늘의 하나를 위한 블록" : "지금").font(.caption).foregroundStyle(.white.opacity(0.7))
                Spacer()
                FocusTimerText(state: state).font(.title3.monospacedDigit().weight(.semibold)).foregroundStyle(.white)
                    .multilineTextAlignment(.trailing)
            }
            Text(state.title).font(.title2.weight(.bold)).foregroundStyle(.white).lineLimit(1)
            Text("오늘의 하나 · \(attributes.one)").font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
        }
    }
}
