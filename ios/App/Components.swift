// 흑백 디자인 부품. 강조는 색 대신 채움·굵기·테두리로.

import SwiftUI

extension Font {
    static let snTitle = Font.system(size: 28, weight: .bold, design: .serif)
    static let snBig = Font.system(size: 40, weight: .bold, design: .serif)
    static let snLabel = Font.system(size: 12, weight: .regular, design: .monospaced)
    static let snTimer = Font.system(size: 56, weight: .regular, design: .monospaced)
}

struct Label12: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.snLabel).tracking(0.8).foregroundStyle(.secondary)
    }
}

struct PrimaryButton: View {
    let title: String
    var disabled = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(Color(.systemBackground))
                .background(Color.primary, in: RoundedRectangle(cornerRadius: 16))
        }
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
    }
}

struct GhostButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(Color.primary)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.separator)))
        }
    }
}

struct RoundIconButton: View {
    let systemImage: String
    let label: String
    var filled = true
    var active = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.title3.weight(.semibold))
                .frame(width: 56, height: 56)
                .foregroundStyle(filled || active ? Color(.systemBackground) : Color.primary)
                .background(Circle().fill(filled || active ? Color.primary : Color.clear))
                .overlay(Circle().stroke(Color.primary))
        }
        .accessibilityLabel(label)
    }
}

struct Chip: View {
    let text: String
    var on = false
    var action: (() -> Void)?
    var body: some View {
        let label = Text(text).font(.subheadline).padding(.horizontal, 12).padding(.vertical, 7)
            .foregroundStyle(on ? Color(.systemBackground) : Color.primary)
            .background(Capsule().fill(on ? Color.primary : Color(.secondarySystemBackground)))
            .overlay(Capsule().stroke(on ? Color.primary : Color(.separator)))
        if let action { Button(action: action) { label }.buttonStyle(.plain) } else { label }
    }
}

/// 칩을 줄바꿈하며 놓는 레이아웃.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.items {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row { var items: [Int] = []; var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            var row = rows[rows.count - 1]
            if !row.items.isEmpty && row.width + spacing + size.width > width {
                let y = row.y + row.height + spacing
                rows.append(Row(y: y))
                row = rows[rows.count - 1]
            }
            row.width += (row.items.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.items.append(index)
            rows[rows.count - 1] = row
        }
        return rows.filter { !$0.items.isEmpty }
    }
}

/// 화면 아래 고정: 오늘의 하나.
struct OneAnchor: View {
    let one: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Divider().padding(.bottom, 12)
            Label12("오늘의 하나")
            Text(one ?? "").font(.headline)
        }
    }
}

extension Date {
    var hhmm: String { formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)) }
}

func dateLabel(_ key: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    guard let date = f.date(from: key) else { return key }
    return date.formatted(.dateTime.locale(Locale(identifier: "ko_KR")).month(.wide).day().weekday(.wide))
}
