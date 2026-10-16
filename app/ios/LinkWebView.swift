// LinkWebView.swift
// Insight Esports — Settings → Messages → "Link web"
//
// WhatsApp Web, the right way round: the WEB shows a QR code, THIS screen
// scans it. The code carries a one-off relay session id, an ephemeral X25519
// public key the browser just minted, and the account id that is signed in
// there. If that account is the one signed in here, we seal this phone's DM
// private key to the browser's ephemeral key and drop it at the relay on the
// web server; the browser picks it up, opens it locally and is linked. The
// relay only ever holds ciphertext it cannot read — end-to-end stays intact.
//
// QR payload (the web emits exactly this; LinkDevice.tsx):
//   INSIGHT-LINK:1:<session id>:<web public key, base64 raw X25519>:<user id>
//
// What we send (POST <relayBase>/api/link/<session id>, Bearer = app JWT):
//   { phonePublicKey, nonce, ciphertext, keyVersion }
//   ciphertext = AES-256-GCM(ct || tag) of "INSIGHT-DM:1:<b64 private key>:<version>"
//   key        = HKDF-SHA256(X25519(phoneEph, webEph), salt ∅, info "insight-link-v1", 32)
//
// HOW TO ADD (three edits, no other changes):
//   1. Add this file to the "Insight Esports" target.
//   2. In SettingsView.swift, inside `SettingsSection(title: "Messages")`,
//      after the "Who can message me" block, add:
//
//          SettingsDivider()
//          NavigationLink(destination: LinkWebView()) {
//              SettingsRowContent(
//                  icon: "qrcode.viewfinder",
//                  title: "Link web",
//                  subtitle: "Scan the code on the web version",
//                  tint: .textSecondary,
//                  showsChevron: true
//              )
//          }
//          .buttonStyle(.plain)
//
//   3. Info.plist — add the camera permission string (the app has no camera
//      use today, so this key is new):
//
//          <key>NSCameraUsageDescription</key>
//          <string>Insight uses the camera to scan the link code shown on the web version.</string>

import SwiftUI
import AVFoundation
import CryptoKit

// MARK: - Relay

enum LinkWeb {
    /// Where the web app lives. The relay is served by the Next.js server
    /// under the app's basePath, so this is the host + "/app" — NOT the API
    /// host, which is why this screen uses a plain URLSession rather than
    /// APIClient. The gate middleware skips /api/ paths, so only the
    /// Authorization header matters.
    static let relayBase = "https://app.insightesportsapp.com/app"

    static let qrPrefix = "INSIGHT-LINK:1:"
    static let hkdfInfo = "insight-link-v1"
}

/// A decoded QR payload.
struct LinkCode: Equatable {
    let sessionId: String
    let webPublicKey: Data   // 32 bytes, raw X25519
    let userId: String

    /// Parses `INSIGHT-LINK:1:<id>:<pub b64>:<userId>`; nil for anything else.
    init?(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix(LinkWeb.qrPrefix) else { return nil }
        let parts = text.dropFirst(LinkWeb.qrPrefix.count).split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 3,
              !parts[0].isEmpty, !parts[2].isEmpty,
              let pub = Data(base64Encoded: String(parts[1])), pub.count == 32 else { return nil }
        sessionId = String(parts[0])
        webPublicKey = pub
        userId = String(parts[2])
    }
}

// MARK: - Screen

struct LinkWebView: View {
    @ObservedObject private var appState = AppState.shared

    private enum Phase: Equatable {
        case scanning
        case confirming
        case sending
        case linked
        case failed(String)
    }

    @State private var phase: Phase = .scanning
    /// The code waiting for the person's OK (drives the confirm alert).
    @State private var pendingCode: LinkCode? = nil
    @State private var cameraDenied = false
    /// Shown over the viewfinder for a few seconds (wrong account etc).
    @State private var notice: String? = nil
    /// The last payload we rejected, so the camera doesn't re-fire on it
    /// every frame while it is still in view.
    @State private var lastRejected: String? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Use Messages on the web")
                    .insightFont(.headlineMedium)
                    .foregroundColor(.textPrimary)

                Text("Your messages are end-to-end encrypted with a key that lives on this phone. Linking lets a browser use the same key, so every conversation stays in sync between the app and the web version.")
                    .insightFont(.bodyMedium)
                    .foregroundColor(.textSecondary)

                VStack(alignment: .leading, spacing: 8) {
                    step(1, "On your computer, open insightesportsapp.com/app and go to Messages → Link this browser.")
                    step(2, "Point this camera at the code it shows. You'll be asked to confirm before anything is shared.")
                }

                viewfinder
                    .frame(maxWidth: .infinity)

                statusBlock

                VStack(alignment: .leading, spacing: 6) {
                    Label("Only link your own computer", systemImage: "exclamationmark.shield.fill")
                        .insightFont(.labelMedium)
                        .foregroundColor(.insightWarning)
                    Text("A linked browser can read and send your messages. The code is checked against your account, and the key is sent sealed so Insight's servers can't read it. To cut a browser off, use \"Unlink this browser\" on the web.")
                        .insightFont(.bodySmall)
                        .foregroundColor(.textMuted)
                }
                .padding(12)
                .background(Color.insightCard)
                .cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.borderSubtle, lineWidth: 1))

                Text("Key version \(DMCrypto.shared.myKeyVersion).")
                    .insightFont(.labelSmall)
                    .foregroundColor(.textMuted)
            }
            .padding(16)
        }
        .background(Color.insightBackground.ignoresSafeArea())
        .navigationTitle("Link web")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Link this computer?", isPresented: confirmBinding, presenting: pendingCode) { code in
            Button("Link") {
                // Set synchronously so the alert's own dismissal (which may
                // run before or after this action) can't bounce us back to
                // scanning.
                phase = .sending
                Task { await deliver(code) }
            }
            Button("Cancel", role: .cancel) { phase = .scanning }
        } message: { _ in
            Text("It will be able to read and send your messages.")
        }
    }

    // MARK: Viewfinder

    @ViewBuilder
    private var viewfinder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.insightCard)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.borderSubtle, lineWidth: 1))

            switch phase {
            case .scanning, .confirming:
                if cameraDenied {
                    VStack(spacing: 10) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 34))
                            .foregroundColor(.textMuted)
                        Text("Camera access is off")
                            .insightFont(.labelLarge)
                            .foregroundColor(.textPrimary)
                        Text("Allow the camera for Insight in Settings to scan the code.")
                            .insightFont(.bodySmall)
                            .foregroundColor(.textMuted)
                            .multilineTextAlignment(.center)
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                        .insightFont(.labelLarge)
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.insightViolet)
                        .clipShape(Capsule())
                    }
                    .padding(20)
                } else {
                    QRScannerView(isActive: phase == .scanning, onDenied: { cameraDenied = true }, onCode: handleScan)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    // Reticle
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.insightViolet.opacity(0.8), lineWidth: 2)
                        .padding(36)
                    if let notice {
                        VStack {
                            Spacer()
                            Text(notice)
                                .insightFont(.labelMedium)
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Color.insightError.opacity(0.92))
                                .clipShape(Capsule())
                                .padding(.bottom, 14)
                        }
                        .transition(.opacity)
                    }
                }
            case .sending:
                VStack(spacing: 12) {
                    ProgressView().tint(.insightViolet)
                    Text("Linking…")
                        .insightFont(.bodyMedium)
                        .foregroundColor(.textSecondary)
                }
            case .linked:
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 44))
                        .foregroundColor(.insightSuccess)
                    Text("Linked ✓")
                        .insightFont(.headlineSmall)
                        .foregroundColor(.textPrimary)
                    Text("Your messages are opening in that browser now.")
                        .insightFont(.bodySmall)
                        .foregroundColor(.textMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(20)
            case .failed(let message):
                VStack(spacing: 10) {
                    Image(systemName: "xmark.octagon.fill")
                        .font(.system(size: 36))
                        .foregroundColor(.insightError)
                    Text(message)
                        .insightFont(.bodyMedium)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                    Button("Scan again") { lastRejected = nil; phase = .scanning }
                        .insightFont(.labelLarge)
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.insightViolet)
                        .clipShape(Capsule())
                }
                .padding(20)
            }
        }
        .frame(width: 280, height: 280)
        .animation(.easeInOut(duration: 0.15), value: notice)
    }

    @ViewBuilder
    private var statusBlock: some View {
        if phase == .scanning && !cameraDenied {
            Text("Hold the code inside the frame.")
                .insightFont(.bodySmall)
                .foregroundColor(.textMuted)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private var confirmBinding: Binding<Bool> {
        Binding(
            get: { phase == .confirming },
            set: { shown in
                if !shown {
                    pendingCode = nil
                    if phase == .confirming { phase = .scanning }
                }
            }
        )
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)")
                .insightFont(.labelMedium)
                .foregroundColor(.insightViolet)
                .frame(width: 18, height: 18)
                .overlay(Circle().stroke(Color.insightViolet, lineWidth: 1))
            Text(text)
                .insightFont(.bodyMedium)
                .foregroundColor(.textSecondary)
        }
    }

    // MARK: Scan → confirm

    private func handleScan(_ raw: String) {
        guard phase == .scanning, raw != lastRejected else { return }
        guard let code = LinkCode(raw) else {
            reject(raw, "That isn't an Insight link code.")
            return
        }
        guard let myId = appState.currentUser?.id else {
            reject(raw, "You're not signed in.")
            return
        }
        guard code.userId == myId else {
            reject(raw, "This code is for a different account.")
            return
        }
        pendingCode = code
        phase = .confirming
    }

    private func reject(_ raw: String, _ message: String) {
        lastRejected = raw
        notice = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            if notice == message { notice = nil }
            // Let the same code be re-read after it has left the frame for a bit.
            if lastRejected == raw { lastRejected = nil }
        }
    }

    // MARK: Seal + deliver

    @MainActor
    private func deliver(_ code: LinkCode) async {
        phase = .sending
        guard let token = KeychainManager.shared.authToken else {
            phase = .failed("You're signed out. Sign in and try again.")
            return
        }
        do {
            let body = try Self.sealedPayload(for: code)
            var req = URLRequest(url: URL(string: "\(LinkWeb.relayBase)/api/link/\(code.sessionId)")!)
            req.httpMethod = "POST"
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.timeoutInterval = 20
            req.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: req)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String

            switch status {
            case 200:
                phase = .linked
            case 403 where error == "ACCOUNT_MISMATCH":
                phase = .failed("This code is for a different account. Sign in to the same account on the web and scan again.")
            case 404:
                phase = .failed("That code expired — refresh the web page and scan again.")
            case 409:
                phase = .failed("That code was already used. Refresh the web page and scan again.")
            case 401:
                phase = .failed("Your session has expired. Sign in again and retry.")
            default:
                phase = .failed("Couldn't reach the web version right now. Check your connection and try again.")
            }
        } catch {
            phase = .failed("Couldn't reach the web version right now. Check your connection and try again.")
        }
    }

    /// The JSON body: this phone's DM private key, sealed to the browser's
    /// ephemeral key with a fresh ephemeral key of our own.
    static func sealedPayload(for code: LinkCode) throws -> [String: Any] {
        let webPub = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: code.webPublicKey)
        let eph = Curve25519.KeyAgreement.PrivateKey()
        let shared = try eph.sharedSecretFromKeyAgreement(with: webPub)
        let key = shared.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data(),
            sharedInfo: LinkWeb.hkdfInfo.data(using: .utf8)!,
            outputByteCount: 32
        )
        let version = DMCrypto.shared.myKeyVersion
        let payload = "INSIGHT-DM:1:\(DMKeys.privateKey().rawRepresentation.base64EncodedString()):\(version)"
        let sealed = try AES.GCM.seal(Data(payload.utf8), using: key)   // random 12-byte nonce
        return [
            "phonePublicKey": eph.publicKey.rawRepresentation.base64EncodedString(),
            "nonce": Data(sealed.nonce).base64EncodedString(),
            "ciphertext": (sealed.ciphertext + sealed.tag).base64EncodedString(),
            "keyVersion": version,
        ]
    }
}

// MARK: - Camera QR scanner

/// AVFoundation QR reader. Asks for camera access on first appearance; when
/// `isActive` is false the session keeps running but decoded codes are
/// ignored (so a confirm sheet doesn't get re-triggered by the same frame).
struct QRScannerView: UIViewRepresentable {
    var isActive: Bool
    var onDenied: () -> Void
    var onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.backgroundColor = UIColor(Color.insightCard)
        context.coordinator.start(in: view)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        context.coordinator.parent = self
    }

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    /// The project's default actor isolation is MainActor, so this class is
    /// main-actor isolated: configuration happens on main (cheap), and only
    /// the blocking startRunning/stopRunning calls hop to a background queue
    /// with the session captured as a local.
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var parent: QRScannerView
        private let session = AVCaptureSession()
        private var configured = false

        init(_ parent: QRScannerView) { self.parent = parent }

        func start(in view: PreviewView) {
            view.previewLayer.session = session
            view.previewLayer.videoGravity = .resizeAspectFill
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                configureAndRun()
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                    Task { @MainActor in
                        if granted { self?.configureAndRun() } else { self?.parent.onDenied() }
                    }
                }
            default:
                parent.onDenied()
            }
        }

        private func configureAndRun() {
            if !configured {
                session.beginConfiguration()
                if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                    ?? AVCaptureDevice.default(for: .video),
                   let input = try? AVCaptureDeviceInput(device: device),
                   session.canAddInput(input) {
                    session.addInput(input)
                }
                let output = AVCaptureMetadataOutput()
                if session.canAddOutput(output) {
                    session.addOutput(output)
                    output.setMetadataObjectsDelegate(self, queue: .main)
                    if output.availableMetadataObjectTypes.contains(.qr) {
                        output.metadataObjectTypes = [.qr]
                    }
                }
                session.commitConfiguration()
                configured = true
            }
            let session = self.session
            DispatchQueue.global(qos: .userInitiated).async {
                if !session.isRunning { session.startRunning() }
            }
        }

        func stop() {
            let session = self.session
            DispatchQueue.global(qos: .userInitiated).async {
                if session.isRunning { session.stopRunning() }
            }
        }

        // Delivered on the main queue (set above), so hopping back onto the
        // main actor is free; the requirement itself is nonisolated.
        nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput,
                                        didOutput metadataObjects: [AVMetadataObject],
                                        from connection: AVCaptureConnection) {
            MainActor.assumeIsolated {
                guard parent.isActive else { return }
                for object in metadataObjects {
                    if let code = object as? AVMetadataMachineReadableCodeObject,
                       code.type == .qr,
                       let text = code.stringValue, !text.isEmpty {
                        parent.onCode(text)
                        return
                    }
                }
            }
        }
    }
}
