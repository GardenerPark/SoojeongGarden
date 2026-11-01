// 지금 블록을 Live Activity로 띄우고, 블록이 끝나면 내린다. 상태를 보고 맞추기만 하므로 몇 번 불러도 된다.

import ActivityKit
import Foundation

enum FocusLiveActivity {
    @MainActor
    static func sync(day: Day) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let current = Activity<FocusAttributes>.activities

        guard let block = day.active, let one = day.one else {
            for activity in current { Task { await activity.end(nil, dismissalPolicy: .immediate) } }
            return
        }

        let content = FocusAttributes.ContentState(title: block.title, startedAt: block.startedAt, endsAt: block.endsAt, related: block.related)
        if let activity = current.first {
            if activity.content.state != content {
                Task { await activity.update(ActivityContent(state: content, staleDate: nil)) }
            }
            for extra in current.dropFirst() { Task { await extra.end(nil, dismissalPolicy: .immediate) } }
        } else {
            _ = try? Activity.request(attributes: FocusAttributes(one: one), content: ActivityContent(state: content, staleDate: nil))
        }
    }
}
