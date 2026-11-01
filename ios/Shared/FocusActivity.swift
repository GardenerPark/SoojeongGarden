// 지금 블록을 잠금화면과 다이내믹 아일랜드에 띄우는 Live Activity의 데이터.

import ActivityKit
import Foundation

struct FocusAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var startedAt: Date
        var endsAt: Date?
        var related: Bool
    }

    var one: String
}
