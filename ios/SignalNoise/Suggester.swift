import Foundation
import SignalNoiseCore
#if canImport(FoundationModels)
import FoundationModels
#endif

/// AI의 역할은 두 군데뿐이다.
/// 1) 전환 회고에서 쏟아낸 것이 오늘의 하나와 관련 있는지 먼저 제안하기
/// 2) 말로 한 선언을 블록으로 바꾸기
/// 기기 안의 Apple 모델(iOS 26+)을 쓰고, 없으면 규칙으로 동작한다. 판단은 항상 사용자가 마지막에 한다.
enum Suggester {
    static func isRelated(_ thought: String, to theOne: String?) async -> Bool {
        guard let theOne else { return false }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let answer = await OnDevice.isRelated(thought, to: theOne) {
            return answer
        }
        #endif
        return Relevance.isRelated(thought, to: theOne)
    }

    static func block(from declaration: String) async -> DeclarationParser.Result {
        let parsed = DeclarationParser.parse(declaration)
        // 규칙으로 시간을 찾았으면 그대로 쓴다 (빠르고 예측 가능)
        if parsed.minutes != nil || parsed.title.isEmpty { return parsed }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let minutes = await OnDevice.minutes(in: declaration) {
            return .init(title: parsed.title, minutes: minutes)
        }
        #endif
        return parsed
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private enum OnDevice {
    static var available: Bool {
        if case .available = SystemLanguageModel.default.availability { return true }
        return false
    }

    static func isRelated(_ thought: String, to theOne: String) async -> Bool? {
        guard available else { return nil }
        let session = LanguageModelSession(instructions: """
        사용자는 오늘 가장 중요한 일 하나를 정했다. 집중하는 동안 떠오른 생각이 그 일을 끝내는 데 직접 도움이 되는지만 판단한다.
        "예" 또는 "아니오" 한 단어로만 답한다.
        """)
        let prompt = "오늘의 하나: \(theOne)\n떠오른 생각: \(thought)"
        guard let answer = try? await session.respond(to: prompt).content else { return nil }
        if answer.contains("예") { return true }
        if answer.contains("아니") { return false }
        return nil
    }

    static func minutes(in declaration: String) async -> Int? {
        guard available else { return nil }
        let session = LanguageModelSession(instructions: """
        사용자가 지금 시작할 일을 말했다. 말에 걸릴 시간이 들어 있으면 분 단위 숫자 하나만 답한다. 시간이 없으면 0이라고 답한다.
        """)
        guard let answer = try? await session.respond(to: declaration).content else { return nil }
        let digits = answer.filter(\.isNumber)
        guard let value = Int(digits), value > 0, value <= 12 * 60 else { return nil }
        return value
    }
}
#endif
