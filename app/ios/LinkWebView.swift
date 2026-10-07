// LinkWebView.swift
// Insight Esports — Settings → Messages → "Link web"
//
// Lets a browser read and send this account's direct messages with the SAME
// end-to-end key this phone uses (WhatsApp Web's model). The web app
// (app.insightesportsapp.com → Messages → "Link this browser") scans the QR
// code, verifies the key against the server's current public key, and keeps
// it only in that browser. Nothing here talks to the server.
//
// Payload format (the web parses exactly this):
//   INSIGHT-DM:1:<base64 raw X25519 private key>:<my key version>
//
// HOW TO ADD (two edits, no other changes):
//   1. Add this file to the "Insight Esports" target.
//   2. In SettingsView.swift, inside `SettingsSection(title: "Messages")`,
//      after the "Who can message me" block, add:
//
//          SettingsDivider()
//          NavigationLink(destination: LinkWebView()) {
//              SettingsRowContent(
//                  icon: "laptopcomputer.and.iphone",
//                  title: "Link web",
//                  subtitle: "Read and send messages at app.insightesportsapp.com",
//                  tint: .textSecondary,
//                  showsChevron: true
//              )
//          }
//          .buttonStyle(.plain)

import SwiftUI
import CoreImage.CIFilterBuiltins

struct LinkWebView: View {
    @State private var revealed = false
    @State private var copied = false

    /// The exact string the web expects.
    private var payload: String {
        "INSIGHT-DM:1:\(DMKeys.privateKey().rawRepresentation.base64EncodedString()):\(DMCrypto.shared.myKeyVersion)"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Use Messages on the web")
                    .insightFont(.headlineMedium)
                    .foregroundColor(.textPrimary)

                Text("Your messages are end-to-end encrypted with a key that lives on this phone. Linking lets a browser use the same key, so every conversation stays in sync between the app and app.insightesportsapp.com.")
                    .insightFont(.bodyMedium)
                    .foregroundColor(.textSecondary)

                VStack(alignment: .leading, spacing: 8) {
                    step(1, "On your computer, open app.insightesportsapp.com and go to Messages → Link this browser.")
                    step(2, "Tap Show QR code below and hold it up to the computer's camera, or copy the code and paste it there.")
                }

                // The QR (and the code) are the private key — shown only on
                // request, never left on screen by default.
                VStack(spacing: 12) {
                    if revealed, let image = qrImage(for: payload) {
                        Image(uiImage: image)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 240, height: 240)
                            .padding(12)
                            .background(Color.white)
                            .cornerRadius(12)
                    } else {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.insightCard)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.borderSubtle, lineWidth: 1))
                            .frame(width: 264, height: 264)
                            .overlay(
                                VStack(spacing: 8) {
                                    Image(systemName: "qrcode")
                                        .font(.system(size: 40))
                                        .foregroundColor(.textMuted)
                                    Text("Hidden until you tap Show")
                                        .insightFont(.bodySmall)
                                        .foregroundColor(.textMuted)
                                }
                            )
                    }

                    HStack(spacing: 10) {
                        Button(revealed ? "Hide QR code" : "Show QR code") {
                            withAnimation(.easeInOut(duration: 0.15)) { revealed.toggle() }
                        }
                        .insightFont(.labelLarge)
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.insightViolet)
                        .clipShape(Capsule())

                        Button(copied ? "Copied" : "Copy code") {
                            UIPasteboard.general.string = payload
                            copied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                        }
                        .insightFont(.labelLarge)
                        .foregroundColor(.insightViolet)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .overlay(Capsule().stroke(Color.insightViolet, lineWidth: 1))
                    }
                }
                .frame(maxWidth: .infinity)

                VStack(alignment: .leading, spacing: 6) {
                    Label("Treat this like a password", systemImage: "exclamationmark.shield.fill")
                        .insightFont(.labelMedium)
                        .foregroundColor(.insightWarning)
                    Text("Anyone who scans this code can read your messages. Only show it to your own computer, and never send the code to anyone.")
                        .insightFont(.bodySmall)
                        .foregroundColor(.textMuted)
                }
                .padding(12)
                .background(Color.insightCard)
                .cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.borderSubtle, lineWidth: 1))

                Text("Key version \(DMCrypto.shared.myKeyVersion). To cut a browser off, use \"Unlink this browser\" on the web.")
                    .insightFont(.labelSmall)
                    .foregroundColor(.textMuted)
            }
            .padding(16)
        }
        .background(Color.insightBackground.ignoresSafeArea())
        .navigationTitle("Link web")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { revealed = false }
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

    /// CoreImage QR, rendered crisp at 10× for the 240pt frame.
    private func qrImage(for string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
