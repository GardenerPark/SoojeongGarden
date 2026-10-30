import AppIntents
import SignalNoiseCore
import SwiftUI
import WidgetKit

@main
struct SignalNoiseWidgets: WidgetBundle {
    var body: some Widget {
        TheOneWidget()
        CaptureWidget()
        CaptureControl()
    }
}

// MARK: 타임라인

struct GardenEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct GardenProvider: TimelineProvider {
    func placeholder(in context: Context) -> GardenEntry {
        GardenEntry(date: .now, snapshot: WidgetSnapshot(theOne: "투자 기획서 초안", currentTitle: "기획서 초안",
                                                          currentStartedAt: .now, plannedMinutes: 120, doneCount: 2))
    }

    func getSnapshot(in context: Context, completion: @escaping (GardenEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : current())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GardenEntry>) -> Void) {
        // 앱이 바뀔 때마다 다시 그리게 하고, 새벽 4시에는 어제의 하나를 지운다
        let next = Calendar.current.nextDate(after: .now, matching: DateComponents(hour: DayEngine.dayStartHour, minute: 1),
                                             matchingPolicy: .nextTime) ?? .now.addingTimeInterval(3600 * 6)
        completion(Timeline(entries: [current()], policy: .after(next)))
    }

    private func current() -> GardenEntry {
        GardenEntry(date: .now, snapshot: WidgetSnapshot(state: GardenStore.shared().load(), now: .now))
    }
}

// MARK: 오늘의 하나 (잠금화면 · 홈 화면)

struct TheOneWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: AppConstants.widgetKind, provider: GardenProvider()) { entry in
            TheOneWidgetView(snapshot: entry.snapshot)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "\(AppConstants.urlScheme)://now"))
        }
        .configurationDisplayName("오늘의 하나")
        .description("아침에 정한 오늘의 하나와 지금의 블록을 보여줘요.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .systemSmall])
    }
}

struct TheOneWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WidgetSnapshot

    var body: some View {
        switch family {
        case .accessoryInline:
            if let one = snapshot.theOne {
                Label(one, systemImage: snapshot.theOneDone ? "checkmark.seal" : "scope")
            } else {
                Label("오늘의 하나를 정해요", systemImage: "sun.horizon")
            }
        case .accessoryRectangular:
            rectangular
        default:
            small
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            Label("오늘의 하나", systemImage: snapshot.theOneDone ? "checkmark.seal.fill" : "scope")
                .font(.caption2)
                .widgetAccentable()
            Text(snapshot.theOne ?? "아침에 정해요")
                .font(.headline)
                .lineLimit(snapshot.currentTitle == nil ? 2 : 1)
                .strikethrough(snapshot.theOneDone)
            if let title = snapshot.currentTitle, let start = snapshot.currentStartedAt {
                HStack(spacing: 4) {
                    Text("지금 \(title)").lineLimit(1)
                    Text(start, style: .timer).monospacedDigit()
                }
                .font(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("오늘의 하나", systemImage: "scope")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(snapshot.theOne ?? "아침에 정해요")
                .font(.headline)
                .lineLimit(3)
                .strikethrough(snapshot.theOneDone)
            Spacer(minLength: 0)
            if let title = snapshot.currentTitle, let start = snapshot.currentStartedAt {
                VStack(alignment: .leading, spacing: 0) {
                    Text("지금 · \(title)").font(.caption.weight(.semibold)).lineLimit(1)
                    Text(start, style: .timer).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            } else if snapshot.doneCount > 0 {
                Label("끝낸 하나 \(snapshot.doneCount)", systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: 쏟아내기 (잠금화면 원형)

struct CaptureWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: AppConstants.captureWidgetKind, provider: GardenProvider()) { entry in
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "plus").font(.title3.weight(.semibold))
                    if entry.snapshot.doneCount > 0 {
                        Text("\(entry.snapshot.doneCount)").font(.caption2).monospacedDigit()
                    }
                }
            }
            .containerBackground(.clear, for: .widget)
            .widgetURL(URL(string: "\(AppConstants.urlScheme)://capture"))
        }
        .configurationDisplayName("쏟아내기")
        .description("누르면 바로 쏟아내기 입력이 열려요.")
        .supportedFamilies([.accessoryCircular])
    }
}

// MARK: 제어 센터 · 잠금화면 컨트롤 · 액션 버튼

struct CaptureControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "CaptureControl") {
            ControlWidgetButton(action: OpenCaptureIntent()) {
                Label("쏟아내기", systemImage: "square.and.pencil")
            }
        }
        .displayName("쏟아내기")
        .description("떠오른 생각을 바로 적어요.")
    }
}
