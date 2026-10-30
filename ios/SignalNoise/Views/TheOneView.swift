import SignalNoiseCore
import SwiftUI

/// 오늘의 하나: 아침 기록과 어제 보관함을 보며 정한다. 하나는 필수, 썸은 최대 2개.
struct TheOneView: View {
    @EnvironmentObject private var model: AppModel
    @State private var theOne = ""
    @State private var thumbs = ["", ""]
    @State private var usedInbox: Set<UUID> = []

    private var morningLines: [String] {
        model.today.morningNotes
            .components(separatedBy: CharacterSet(charactersIn: "\n.!?"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.count >= 2 }
    }

    private var inbox: [Thought] { model.state.inbox.filter { !usedInbox.contains($0.id) } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("오늘 이것 하나만 끝내면 되는 일", text: $theOne, axis: .vertical)
                        .font(.title3.weight(.semibold))
                } header: {
                    Text("오늘의 하나")
                } footer: {
                    Text("정하면 잠금화면 위젯에 보여요.")
                }

                Section("썸 · 선택") {
                    ForEach(thumbs.indices, id: \.self) { i in
                        TextField(i == 0 ? "썸 하나" : "썸 둘", text: $thumbs[i])
                    }
                }

                if !inbox.isEmpty {
                    Section {
                        ForEach(inbox) { t in
                            pickRow(t.text) { usedInbox.insert(t.id) }
                        }
                        .onDelete { offsets in
                            let ids = offsets.map { inbox[$0].id }
                            model.mutate { s in ids.forEach { DayEngine.removeFromInbox(&s, id: $0) } }
                        }
                    } header: {
                        Text("보관함")
                    } footer: {
                        Text("눌러서 오늘로 가져오고, 밀어서 지워요. 남겨두면 내일 아침 다시 만나요.")
                    }
                }

                if !morningLines.isEmpty {
                    Section("아침에 쓴 것") {
                        ForEach(morningLines, id: \.self) { line in pickRow(line) {} }
                    }
                }
            }
            .navigationTitle(Format.dayTitle.string(from: .now))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("아침 기록") { model.mutate { DayEngine.reopenMorning(&$0) } }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    haptic(.medium)
                    model.mutate {
                        DayEngine.chooseTheOne(&$0, theOne: theOne, thumbs: thumbs, usedInboxIDs: usedInbox)
                    }
                } label: {
                    Text("이걸로 시작해요")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .disabled(theOne.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .padding()
                .background(.bar)
            }
        }
    }

    /// 빈 칸을 순서대로 채운다: 오늘의 하나 → 썸 하나 → 썸 둘
    private func pickRow(_ text: String, onPicked: @escaping () -> Void) -> some View {
        Button {
            if theOne.isEmpty {
                theOne = text
            } else if let i = thumbs.firstIndex(where: \.isEmpty) {
                thumbs[i] = text
            } else {
                return
            }
            haptic()
            onPicked()
        } label: {
            HStack {
                Text(text).foregroundStyle(.primary)
                Spacer()
                Image(systemName: "arrow.up.circle").foregroundStyle(.secondary)
            }
        }
    }
}
