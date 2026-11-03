import SignalNoiseCore
import SwiftUI

@main
struct SignalNoiseApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onOpenURL { model.handle(url: $0) }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { model.refresh() }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            switch model.route {
            case .morning: MorningView()
            case .theOne: TheOneView()
            case .now: NowView()
            case .closed: ClosedView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.route)
        // 쏟아내기는 어느 화면에서든 열린다
        .sheet(isPresented: $model.showCapture) {
            CaptureSheet()
                .presentationDetents([.height(220)])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $model.reviewingBlock) { block in
            TransitionView(finished: block)
                .interactiveDismissDisabled()
        }
        .sheet(isPresented: $model.showDayClose) {
            DayCloseView()
        }
    }
}
