// LinkDevice — "Link this browser" (/messages/link).
//
// WhatsApp Web's model, the right way round: the phone owns the message key;
// THIS page shows a QR code and the phone scans it (Settings → Messages →
// Link web). The code carries a one-off relay session id, an ephemeral X25519
// public key minted here, and the account id. The phone checks the account
// matches, seals its DM private key to our ephemeral key and drops it at the
// relay (/api/link/:id, a blind in-memory mailbox on the Next server). We
// poll, open the blob locally and run it through the same import path as a
// pasted code — which verifies the key against the account's published public
// key (GET /dm/keys/:me) before storing it in IndexedDB. The server never sees
// anything it could read.
//
// QR payload (LinkWebView.swift parses exactly this):
//   INSIGHT-LINK:1:<session id>:<web ephemeral public key, base64>:<user id>
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Link2, Link2Off, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { withBase } from "@/lib/base-path";
import { socketHost } from "@/lib/socket";
import { useAppState } from "@/store/app-state";
import { Kicker, Page, PrimaryButton, Spinner, TabHeaderTitle } from "@/components/ui";
import { BackButton } from "@/components/shell/NavBar";
import { b64decode, b64encode, deriveLinkKey, openBytes, publicKeyFor, randomPrivateKey } from "./crypto";
import { clearKeys, parseLinkPayload, publicKeyBase64, saveKey, type StoredKey } from "./keys";
import { adoptKey, currentLinkState, forgetKeyState, onDM, refreshUnread, type LinkState } from "./service";
import { normalizeKeyRow } from "./types";

export const LINK_QR_PREFIX = "INSIGHT-LINK:1:";
const POLL_MS = 1500;
// After this many back-to-back expiries with nobody scanning, stop minting
// codes and wait for a click (an abandoned tab shouldn't poll forever).
const MAX_AUTO_RENEWALS = 3;

type QRState =
  | { kind: "loading" }
  | { kind: "ready"; id: string; expiresAt: number; dataUrl: string; priv: Uint8Array }
  | { kind: "expired" }
  | { kind: "error"; message: string };

export function LinkDevice() {
  const router = useRouter();
  const { user, refreshUnread: refreshShellUnread } = useAppState();
  const [link, setLink] = useState<LinkState>(currentLinkState());
  const [showPaste, setShowPaste] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [relink, setRelink] = useState(false);
  const isMock = socketHost().includes("localhost");

  useEffect(() => onDM("link", ({ state }) => setLink(state)), []);

  /** The shared tail of every path (QR hand-off, paste, mock): verify + store. */
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
          setError("That key doesn't match this account's current message key. Make sure the phone is signed in to the same account, then scan again.");
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
  // The code is shown when this browser needs a key: unlinked, stale, or the
  // person asked to link again. Hidden once the hand-off has succeeded.
  const wantCode = !done && !!user && (!linked || link.kind === "stale" || relink);

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
                  ? `Your phone has moved to key version ${link.serverVersion}; this browser holds version ${link.version}. Scan the code below to relink.`
                  : `Key version ${link.version}. Messages sent and received here open on your phone too.`}
              </div>
              <div className="mt-3 flex items-center gap-4">
                <button type="button" onClick={unlink} disabled={busy} className="inline-flex items-center gap-1.5 t-label-md text-error hover:underline disabled:opacity-50">
                  <Link2Off size={14} /> Unlink this browser
                </button>
                {link.kind === "linked" && !relink && !done ? (
                  <button type="button" onClick={() => setRelink(true)} className="inline-flex items-center gap-1.5 t-label-md text-violet hover:underline">
                    <Link2 size={14} /> Link again
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {wantCode ? (
          <>
            <div>
              <Kicker>On your phone</Kicker>
              <ol className="mt-2 flex flex-col gap-1.5 t-body-md text-secondary list-decimal pl-5">
                <li>Open <span className="text-primary">Insight</span> → <span className="text-primary">Settings → Messages → Link web</span>.</li>
                <li>Point the camera at this code. The phone checks it&apos;s your account, then hands this browser the message key — the key never passes through Insight&apos;s servers in the clear.</li>
              </ol>
            </div>

            <LinkQR
              userId={user.id}
              paused={busy}
              onDelivered={importPayload}
              onError={setError}
            />
          </>
        ) : null}

        {error ? <p className="t-body-sm text-error">{error}</p> : null}
        {done ? <p className="t-body-sm text-success">{done}</p> : null}

        {wantCode ? (
          <div className="flex flex-col gap-3">
            {!showPaste ? (
              <button type="button" onClick={() => setShowPaste(true)} className="self-start t-label-md text-muted hover:text-primary hover:underline">
                Have a code? Paste it
              </button>
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
            {isMock ? (
              <button type="button" onClick={useMockKey} className="self-start t-label-md text-violet hover:underline">Use the mock backend&apos;s key (local dev)</button>
            ) : null}
          </div>
        ) : null}

        <p className="t-body-sm text-muted">
          The key is stored only in this browser. Logging out, clearing site data, or unlinking removes it; nothing about it is sent to Insight&apos;s servers.
        </p>
      </div>
    </Page>
  );
}

// ── The QR + relay poll ───────────────────────────────────────────────────

/** Mints an ephemeral X25519 key, opens a relay session, draws the code and
 *  polls until the phone delivers. Delivered blobs are opened HERE with the
 *  ephemeral private key, which lives only in this component's state. */
function LinkQR({ userId, paused, onDelivered, onError }: {
  userId: string;
  paused: boolean;
  onDelivered: (payload: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [qr, setQr] = useState<QRState>({ kind: "loading" });
  // Bumped to mint a fresh session (refresh click, or auto-renewal on expiry).
  const [generation, setGeneration] = useState(0);
  const renewals = useRef(0);
  const onDeliveredRef = useRef(onDelivered);
  const onErrorRef = useRef(onError);
  useEffect(() => { onDeliveredRef.current = onDelivered; onErrorRef.current = onError; }, [onDelivered, onError]);

  /** A fresh session + code (from a click, an expiry, or after a hand-off). */
  const renew = useCallback(() => { setQr({ kind: "loading" }); setGeneration((g) => g + 1); }, []);
  const refresh = () => { renewals.current = 0; renew(); };

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const expire = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (renewals.current < MAX_AUTO_RENEWALS) {
        renewals.current += 1;
        renew();
      } else {
        setQr({ kind: "expired" });
      }
    };

    (async () => {
      const priv = randomPrivateKey();
      const webPublicKey = b64encode(publicKeyFor(priv));
      let created: { id: string; userId: string; expiresAt: number };
      try {
        const res = await fetch(withBase("/api/link"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webPublicKey }),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        created = await res.json();
      } catch {
        if (!cancelled) setQr({ kind: "error", message: "Couldn't start a link session. Check your connection and try again." });
        return;
      }
      if (cancelled) return;
      if (created.userId !== userId) {
        setQr({ kind: "error", message: "Your web session doesn't match this account any more. Reload the page." });
        return;
      }
      const payload = `${LINK_QR_PREFIX}${created.id}:${webPublicKey}:${created.userId}`;
      let dataUrl: string;
      try {
        dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 0, width: 720, color: { dark: "#0a0a0fff", light: "#ffffffff" } });
      } catch {
        if (!cancelled) setQr({ kind: "error", message: "Couldn't draw the code. Try again." });
        return;
      }
      if (cancelled) return;
      setQr({ kind: "ready", id: created.id, expiresAt: created.expiresAt, dataUrl, priv });

      let inFlight = false;
      timer = window.setInterval(async () => {
        if (cancelled || inFlight) return;
        if (Date.now() >= created.expiresAt) { expire(); return; }
        inFlight = true;
        try {
          const res = await fetch(withBase(`/api/link/${encodeURIComponent(created.id)}`), { credentials: "same-origin", cache: "no-store" });
          if (cancelled) return;
          if (res.status === 404) { expire(); return; }
          if (!res.ok) return; // transient; keep polling
          const j = await res.json() as { status: "pending" | "delivered"; phonePublicKey?: string; nonce?: string; ciphertext?: string; keyVersion?: number };
          if (j.status !== "delivered") return;
          if (timer) { clearInterval(timer); timer = null; }
          setQr({ kind: "loading" });
          try {
            const key = await deriveLinkKey(priv, j.phonePublicKey ?? "");
            const plain = await openBytes(b64decode(j.ciphertext ?? ""), b64decode(j.nonce ?? ""), key);
            const text = new TextDecoder().decode(plain);
            if (!parseLinkPayload(text)) throw new Error("bad payload");
            await onDeliveredRef.current(text);
            // Whatever importPayload decided (success or a verification error)
            // has been reported; a new code is ready should they scan again.
            if (!cancelled) renew();
          } catch {
            if (!cancelled) {
              onErrorRef.current("The phone's reply couldn't be opened. Refresh the code and scan again.");
              renew();
            }
          }
        } catch {
          /* network hiccup: keep polling */
        } finally {
          inFlight = false;
        }
      }, POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // `generation` is the intentional trigger; userId changes remount via the parent.
  }, [generation, userId, renew]);

  return (
    <div className="flex flex-col gap-3 items-start">
      <div className="relative w-[264px] h-[264px] rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(124,92,252,0.25)]">
        {qr.kind === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing for next/image to optimise
          <img src={qr.dataUrl} alt="Link code — scan with the Insight app" width={240} height={240} className={`block size-[240px] ${paused ? "opacity-40" : ""}`} draggable={false} />
        ) : (
          <div className="size-[240px] rounded-lg bg-[#f3f2fa]" />
        )}
        {qr.kind !== "ready" || paused ? (
          <div className="absolute inset-3 rounded-lg flex flex-col items-center justify-center gap-3 px-6 text-center bg-white/92">
            {qr.kind === "loading" || paused ? (
              <>
                <Spinner size={22} className="border-[#7c5cfc]/30 border-t-[#7c5cfc]" />
                <span className="t-body-sm text-[#4b4b5a]">{paused ? "Checking the key…" : "Getting a code…"}</span>
              </>
            ) : null}
            {qr.kind === "expired" ? (
              <>
                <span className="t-label-lg text-[#1a1a24]">Code expired</span>
                <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-full bg-[#7c5cfc] px-4 py-2 text-white t-label-md">
                  <RefreshCw size={14} /> Refresh
                </button>
              </>
            ) : null}
            {qr.kind === "error" ? (
              <>
                <span className="t-body-sm text-[#4b4b5a]">{qr.message}</span>
                <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-full bg-[#7c5cfc] px-4 py-2 text-white t-label-md">
                  <RefreshCw size={14} /> Try again
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 t-body-sm text-muted">
        <Smartphone size={14} className="shrink-0" />
        <span>{qr.kind === "ready" ? "Waiting for your phone… codes refresh every 5 minutes." : " "}</span>
      </div>
    </div>
  );
}
