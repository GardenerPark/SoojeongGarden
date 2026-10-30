import Foundation

/// 쏟아낸 것이 오늘의 하나와 관련 있어 보이는지에 대한 기기 내 규칙 기반 제안.
/// 온디바이스 모델을 쓸 수 없을 때의 기본값이고, 판단은 항상 사용자가 한다.
public enum Relevance {
    public static let threshold = 0.25

    private static let particles = ["에서", "으로", "에게", "하고", "이랑", "은", "는", "이", "가", "을", "를", "에", "의", "도", "로", "와", "과", "랑"]

    public static func isRelated(_ thought: String, to theOne: String?) -> Bool {
        guard let theOne else { return false }
        return score(thought, theOne) >= threshold
    }

    /// 0...1. 단어가 겹치면 바로 관련, 아니면 글자 두 개 묶음(bigram) 유사도.
    public static func score(_ a: String, _ b: String) -> Double {
        let wa = words(a), wb = words(b)
        guard !wa.isEmpty, !wb.isEmpty else { return 0 }
        if !wa.isDisjoint(with: wb) { return 1 }
        let ba = bigrams(wa), bb = bigrams(wb)
        guard !ba.isEmpty, !bb.isEmpty else { return 0 }
        let shared = Double(ba.intersection(bb).count)
        // 짧은 쪽 기준: 오늘의 하나는 보통 짧은 한 줄이다
        return shared / Double(min(ba.count, bb.count))
    }

    static func words(_ s: String) -> Set<String> {
        let parts = s.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted)
        return Set(parts.compactMap { w -> String? in
            var w = w
            if let p = particles.first(where: { w.hasSuffix($0) && w.count > $0.count + 1 }) {
                w = String(w.dropLast(p.count))
            }
            return w.count >= 2 ? w : nil
        })
    }

    static func bigrams(_ words: Set<String>) -> Set<String> {
        var out = Set<String>()
        for w in words {
            let chars = Array(w)
            guard chars.count >= 2 else { continue }
            for i in 0..<(chars.count - 1) { out.insert(String(chars[i...i + 1])) }
        }
        return out
    }
}
