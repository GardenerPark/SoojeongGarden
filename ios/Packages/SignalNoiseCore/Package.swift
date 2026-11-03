// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SignalNoiseCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SignalNoiseCore", targets: ["SignalNoiseCore"]),
    ],
    targets: [
        .target(name: "SignalNoiseCore"),
        .testTarget(name: "SignalNoiseCoreTests", dependencies: ["SignalNoiseCore"]),
    ]
)
