// LinkDevice — "Link this browser" (/messages/link).
//
// WhatsApp Web's idea: the phone owns the message key; the browser becomes a
// linked device by importing it once. The app shows the key as a QR code
// (Settings → Link web); here you scan it with the webcam or paste the code.
// Nothing is published: the browser only verifies the key against the
// account's current public key (GET /dm/keys/:me) and stores it locally.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardPaste, Link2, Link2Off, ShieldCheck } from "lucide-react";
import jsQR from "jsqr";
import { api, endpoints } from "@/lib/api";
import { socketHost } from "@/lib/socket";
import { useAppState } from "@/store/app-state";
import { Kicker, Page, PrimaryButton, TabHeaderTitle } from "@/components/ui";
import { BackButton } from "@/components/shell/NavBar";
import { publicKeyFor } from "./crypto";
import { clearKeys, parseLinkPayload, publicKeyBase64, saveKey, type StoredKey } from "./keys";
import { adoptKey, currentLinkState, forgetKeyState, onDM, refreshUnread, type LinkState } from "./service";
import { normalizeKeyRow } from "./types";

type Mode = "scan" | "paste";

export function LinkDevice() {
  const router = useRouter();
  const { user, refreshUnread: refreshShellUnread } = useAppState();
  const [link, setLink] = useState<LinkState>(currentLinkState());
  const [mode, setMode] = useState<Mode>("scan");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const isMock = socketHost().includes("localhost");

  useEffect(() => onDM("link", ({ state }) => setLink(state)), []);

  const importPayload = useCallback(async (text: string) => {
    if (!user) return;
    const parsed = parseLinkPayload(text);
    if (!parsed) { setError("That doesn't look like a link code from the Insight app."); return; }
    setBusy(true); setError(null);
    try {
      const myPub = publicKeyBase64(parsed.privateKey);
      // The account's current key, as the server knows it.
      const current = normalizeKeyRow(await api.get(endpoints.dmKey(user.id)));
      let version = parsed.version;
      let stale = false;
      if (current.publicKey && current.publicKey === myPub) {
        version = current.keyVersion ?? parsed.version;
      } else {
        // Maybe an older version of ours: still useful for history, but new
        // messages are sealed to the phone's newer key.
        let matchesOld = false;
        try {
          const old = normalizeKeyRow(await api.get(endpoints.dmKey(user.id, parsed.version)));
          matchesOld = !!old.publicKey && old.publicKey === myPub;
        } catch { /* no such version */ }
        if (!matchesOld) {
          setError("That code doesn't match this account's current message key. Open the Insight app, go to Settings → Link web, and scan again.");
          return;
        }
        stale = true;
      }
      const stored: StoredKey = { privateKey: parsed.privateKey, publicKey: publicKeyFor(parsed.privateKey), version, userId: user.id, linkedAt: Date.now() };
      await saveKey(stored);
      adoptKey(stored);
      await refreshUnread();
      void refreshShellUnread();
      setDone(stale ? "Linked with an older key — new messages need a fresh link from your phone." : "This browser is linked. Your messages will open here now.");
      if (!stale) setTimeout(() => router.replace("/messages"), 900);
    } catch {
      setError("Couldn't verify the key right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [user, router, refreshShellUnread]);

  async function unlink() {
    setBusy(true);
    try { await clearKeys(); forgetKeyState(); setDone(null); setError(null); } finally { setBusy(false); }
  }

  async function useMockKey() {
    try {
      const r = await api.get<{ payload?: string }>("/dm/_mock/link-payload");
      if (r?.payload) await importPayload(r.payload);
    } catch { setError("The mock backend isn't running."); }
  }

  const linked = link.kind === "linked" || link.kind === "stale";

  return (
    <Page className="px-4">
      <div className="flex items-center gap-2.5 pt-1.5 pb-2">
        <BackButton />
        <TabHeaderTitle text="Link this browser" />
      </div>

      <div className="max-w-xl flex flex-col gap-5 mt-2">
        <p className="t-body-md text-secondary">
          Your messages are end-to-end encrypted with a key that lives on your phone. Link this browser once and it reads and sends with the same key, so every conversation stays in sync with the app.
        </p>

        {linked ? (
          <div className="ledger p-4 flex items-start gap-3">
            <ShieldCheck size={20} className="text-success shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="t-label-lg text-primary">{link.kind === "stale" ? "Linked with an older key" : "This browser is linked"}</div>
              <div className="t-body-sm text-muted mt-1">
                {link.kind === "stale"
                  ? `Your phone has moved to key version ${link.serverVersion}; this browser holds version ${link.version}. Relink below to read new messages.`
                  : `Key version ${link.version}. Messages sent and received here open on your phone too.`}
              </div>
              <button type="button" onClick={unlink} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 t-label-md text-error hover:underline disabled:opacity-50">
                <Link2Off size={14} /> Unlink this browser
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <Kicker>On your phone</Kicker>
          <ol className="mt-2 flex flex-col gap-1.5 t-body-md text-secondary list-decimal pl-5">
            <li>Open the Insight app on your phone and go to <span className="text-primary">Settings → Messages → Link web</span>.</li>
            <li>Scan its QR code with this computer&apos;s camera below (press <span className="text-primary">Start camera</span> if your browser hasn&apos;t asked for it), or copy the code and paste it instead.</li>
          </ol>
        </div>

        <div className="flex gap-6 hairline-b">
          {(["scan", "paste"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className="flex flex-col gap-1.5 pb-0">
              <span className={`inline-flex items-center gap-1.5 ${mode === m ? "t-label-lg text-primary" : "t-body-md text-muted"}`}>
                {m === "scan" ? <Camera size={15} /> : <ClipboardPaste size={15} />}{m === "scan" ? "Scan QR code" : "Paste code"}
              </span>
              <span className={`h-0.5 rounded-sm ${mode === m ? "bg-violet" : "bg-transparent"}`} />
            </button>
          ))}
        </div>

        {mode === "scan" ? (
          <QRScanner active={!busy && !done} onCode={importPayload} />
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void importPayload(code); }}>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="INSIGHT-DM:1:…"
              rows={3}
              spellCheck={false}
              autoCapitalize="none"
              className="field w-full resize-none font-mono text-[13px]"
            />
            <PrimaryButton type="submit" loading={busy} disabled={!code.trim() || busy} className="self-start">
              <Link2 size={15} /> Link
            </PrimaryButton>
          </form>
        )}

        {error ? <p className="t-body-sm text-error">{error}</p> : null}
        {done ? <p className="t-body-sm text-success">{done}</p> : null}

        {isMock ? (
          <button type="button" onClick={useMockKey} className="self-start t-label-md text-violet hover:underline">Use the mock backend&apos;s key (local dev)</button>
        ) : null}

        <p className="t-body-sm text-muted">
          The key is stored only in this browser. Logging out, clearing site data, or unlinking removes it; nothing about it is sent to Insight&apos;s servers.
        </p>
      </div>
    </Page>
  );
}

/** Webcam + jsQR: samples the video frame a few times a second until a payload decodes.
 *
 *  The camera is requested on mount and again from an explicit "Start camera"
 *  press (Safari only prompts reliably from a user gesture). A rear-camera
 *  request that fails because there is no such camera (desktops) retries with
 *  any camera; a refusal shows the browser's own error and a "Try again". */
type ScanState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "denied"; name: string; message: string }
  | { kind: "unsupported" };

function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** A rear camera at 720p when there is one, otherwise whatever camera exists. */
async function openCamera(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "OverconstrainedError" || name === "NotFoundError" || name === "ConstraintNotSatisfiedError" || name === "DevicesNotFoundError") {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw e;
  }
}

function QRScanner({ active, onCode }: { active: boolean; onCode: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  // Bumped by "Start camera" / "Try again" so the effect requests the camera again.
  const [attempt, setAttempt] = useState(0);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!active) { setState({ kind: "idle" }); return; }
    if (!cameraSupported()) { setState({ kind: "unsupported" }); return; }
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    setState({ kind: "starting" });
    openCamera()
      .then(async (s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const v = videoRef.current;
        if (!v) { s.getTracks().forEach((t) => t.stop()); return; }
        v.srcObject = s;
        try { await v.play(); } catch { /* autoPlay + muted covers the gesture rule; play() may still reject while the element is detached */ }
        if (cancelled) return;
        setState({ kind: "scanning" });
        timer = window.setInterval(() => {
          if (!v.videoWidth || !v.videoHeight) return;
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (hit?.data && parseLinkPayload(hit.data)) {
            if (timer) { clearInterval(timer); timer = null; }
            onCodeRef.current(hit.data);
          }
        }, 250);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "Error";
        const message = e instanceof Error && e.message ? e.message : String(e ?? "");
        setState({ kind: "denied", name, message });
      });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [active, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  const deniedHint = (name: string) =>
    name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError"
      ? "Camera access was blocked. Allow the camera for this site in your browser's address bar, then try again — or paste the code instead."
      : name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError"
        ? "No camera was found on this computer. Paste the code instead."
        : name === "NotReadableError" || name === "AbortError" || name === "TrackStartError"
          ? "The camera is in use by another app or couldn't start. Close other apps using it, then try again."
          : "The camera couldn't start. Try again, or paste the code instead.";

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-card border border-border-subtle">
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 size-full object-cover" />
        {state.kind === "scanning" ? <div className="absolute inset-8 rounded-lg border-2 border-violet/70 pointer-events-none" /> : null}
        {state.kind !== "scanning" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-card/90">
            {state.kind === "starting" ? <span className="t-body-sm text-muted">Starting the camera…</span> : null}
            {state.kind === "idle" ? (
              <>
                <span className="t-body-sm text-muted">Camera paused.</span>
                {active ? <PrimaryButton type="button" onClick={retry}><Camera size={15} /> Start camera</PrimaryButton> : null}
              </>
            ) : null}
            {state.kind === "unsupported" ? (
              <span className="t-body-sm text-muted">This browser can&apos;t use the camera here (it needs HTTPS and camera support). Paste the code instead.</span>
            ) : null}
            {state.kind === "denied" ? (
              <>
                <span className="t-body-sm text-muted">{deniedHint(state.name)}</span>
                <span className="t-label-sm text-muted font-mono break-all">{state.name}{state.message ? `: ${state.message}` : ""}</span>
                <PrimaryButton type="button" onClick={retry}><Camera size={15} /> Try again</PrimaryButton>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="t-body-sm text-muted flex-1">Hold the QR code inside the frame.</span>
        {state.kind === "starting" || state.kind === "scanning" ? (
          <button type="button" onClick={retry} className="t-label-md text-violet hover:underline whitespace-nowrap">{state.kind === "scanning" ? "Restart camera" : "Start camera"}</button>
        ) : null}
      </div>
    </div>
  );
}
