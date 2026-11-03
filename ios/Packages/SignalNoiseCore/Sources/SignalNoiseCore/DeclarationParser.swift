import Foundation

/// "필라테스 2시간"처럼 말로 한 선언을 블록(제목 + 예정 시간)으로 바꾼다.
/// 시간이 없으면 끝났다고 말할 때까지 열어둔다 (plannedMinutes == nil).
public enum DeclarationParser {
    public struct Result: Equatable, Sendable {
        public var title: String
        public var minutes: Int?
        public init(title: String, minutes: Int?) {
            self.title = title
            self.minutes = minutes
        }
    }

    private static let koreanNumbers: [String: Double] = [
        "한": 1, "두": 2, "세": 3, "네": 4, "다섯": 5, "여섯": 6,
    ]

    private struct Rule {
        let regex: NSRegularExpression
        let minutes: ([String?]) -> Double?
    }

    private static func re(_ pattern: String) -> NSRegularExpression {
        // 패턴은 코드에 고정된 값이라 실패하지 않는다
        try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    private static func number(_ s: String?) -> Double? {
        guard let s else { return nil }
        return Double(s) ?? koreanNumbers[s]
    }

    /// "2시간 동안"의 "동안"처럼 시간 뒤에 붙는 말까지 함께 덜어낸다
    private static let tail = #"(?:\s*(?:동안|정도|쯤))?"#

    private static let rules: [Rule] = [
        // 2시간, 1.5시간, 한 시간 반, 2시간 30분
        Rule(regex: re(#"(\d+(?:\.\d+)?|한|두|세|네|다섯|여섯)\s*시간(?:\s*(반)|\s*(\d+)\s*분)?\#(tail)"#)) { g in
            guard let h = number(g[0]) else { return nil }
            let extra = g[1] != nil ? 30 : (number(g[2]) ?? 0)
            return h * 60 + extra
        },
        // 반 시간
        Rule(regex: re(#"반\s*시간\#(tail)"#)) { _ in 30 },
        // 45분
        Rule(regex: re(#"(\d+)\s*분\#(tail)"#)) { g in number(g[0]) },
        // 1h30m, 2h, 1.5h
        Rule(regex: re(#"\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)(?:\s*(\d+)\s*(?:m|min|mins|minutes?))?\b"#)) { g in
            guard let h = number(g[0]) else { return nil }
            return h * 60 + (number(g[1]) ?? 0)
        },
        // 45m, 30min
        Rule(regex: re(#"\b(\d+)\s*(?:m|min|mins|minutes?)\b"#)) { g in number(g[0]) },
    ]

    private static let trailingFillers = [
        "할게요", "할게", "하기", "하자", "시작", "동안", "정도", "쯤", "부터",
    ]
    private static let attachedSuffixes = ["할게요", "할게", "하기", "시작"]
    private static let leadingFillers = ["지금부터", "이제", "지금", "먼저"]

    public static func parse(_ input: String) -> Result {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        var minutes: Int?

        for rule in rules {
            let ns = text as NSString
            guard let m = rule.regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { continue }
            let groups: [String?] = (1..<m.numberOfRanges).map { i in
                let r = m.range(at: i)
                return r.location == NSNotFound ? nil : ns.substring(with: r)
            }
            if let value = rule.minutes(groups), value > 0 {
                minutes = Int(value.rounded())
                text = ns.replacingCharacters(in: m.range, with: " ")
                break
            }
        }

        return Result(title: cleanTitle(text), minutes: minutes)
    }

    static func cleanTitle(_ raw: String) -> String {
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ",.·-—:~!"))
        var words = raw.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        // 앞뒤의 군말만 덜어낸다. 가운데 단어는 건드리지 않는다.
        while let first = words.first, leadingFillers.contains(first) { words.removeFirst() }
        while let last = words.last {
            if trailingFillers.contains(last) {
                words.removeLast()
            } else if let f = attachedSuffixes.first(where: { last.hasSuffix($0) && last.count > $0.count }) {
                // "독서할게" → "독서"
                words[words.count - 1] = String(last.dropLast(f.count))
            } else {
                break
            }
        }
        return words.joined(separator: " ").trimmingCharacters(in: separators)
    }
}
