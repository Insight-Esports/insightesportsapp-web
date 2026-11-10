// moderation/ActionMenu.tsx — the one context menu behind every message,
// comment and person (iOS .contextMenu / Menu). On the web the hover "⋯"
// and a right-click (contextmenu) open the same menu; a long press does on
// touch screens; Shift+F10 / the Menu key on a focused row, or Enter on the
// "⋯", from the keyboard. Arrow keys move, Enter picks, Esc closes and
// hands focus back. Portaled to <body> so a sheet or a scroller never
// clips it.
//
// `rise` (the DM bubble menu): the menu grows out of the held bubble —
// transform-origin at the press point / the "⋯" — in 0.26 s and sinks back
// into it on dismiss in 0.2 s. A "copy" action shows a "Copied" toast (the
// DM toast's look) unless the screen shows its own (`copyToast={false}`).
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { clsx } from "@/lib/format";

export interface MenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** A hairline above this item (Report / Block sit below one). */
  dividerBefore?: boolean;
  onSelect: () => void;
}

export type MenuAnchor = { kind: "point"; x: number; y: number } | { kind: "rect"; rect: DOMRect };

const noop = () => () => {};
/** Renders children into <body> (menus, sheets and dialogs above any sheet). */
export function Portal({ children }: { children: ReactNode }) {
  // false on the server and while hydrating, true from then on (so a menu
  // opened later is in the DOM on its first render and can be measured).
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}

type Placed = { left: number; top: number; origin: string };
type Snapshot = { actions: MenuAction[]; placed: Placed };

/** The menu's lifetime after dismiss when it sinks back (`.menu-fall`). */
const FALL_MS = 200;

export function ActionMenu({ anchor, actions, onClose, label = "Actions", rise = false, copyToast = true }: { anchor: MenuAnchor | null; actions: MenuAction[]; onClose: () => void; label?: string; rise?: boolean; copyToast?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = !!anchor && actions.length > 0;
  // What the menu showed last, so it can sink back after the screen has
  // already cleared its target (actions → []).
  const last = useRef<Snapshot | null>(null);
  const [leaving, setLeaving] = useState<Snapshot | null>(null);
  const [copied, setCopied] = useState(0);

  // Place it at the pointer, or under the "⋯" (right edges aligned), kept on screen.
  useLayoutEffect(() => {
    if (!open || !anchor) {
      if (rise && last.current) setLeaving(last.current);
      last.current = null;
      setPlaced(null);
      return;
    }
    setLeaving(null);
    const el = ref.current;
    const w = el?.offsetWidth ?? 200, h = el?.offsetHeight ?? 160;
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    let left: number, top: number;
    if (anchor.kind === "point") { left = anchor.x; top = anchor.y; }
    else {
      left = anchor.rect.right - w;
      top = anchor.rect.bottom + 4;
      if (top + h > vh - m) top = anchor.rect.top - h - 4;
    }
    if (left + w > vw - m) left = vw - m - w;
    if (top + h > vh - m) top = vh - m - h;
    left = Math.max(m, left); top = Math.max(m, top);
    // The point it grows from, in the menu's own box (clamped to its edges).
    const ax = anchor.kind === "point" ? anchor.x : anchor.rect.left + anchor.rect.width / 2;
    const ay = anchor.kind === "point" ? anchor.y : anchor.rect.top + anchor.rect.height / 2;
    const ox = Math.min(w, Math.max(0, ax - left)), oy = Math.min(h, Math.max(0, ay - top));
    setPlaced({ left, top, origin: `${Math.round(ox)}px ${Math.round(oy)}px` });
  }, [open, anchor, rise]);

  useEffect(() => {
    if (open && placed) last.current = { actions, placed };
  });

  // The sinking copy goes once its 0.2 s is up.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), FALL_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  // "Copied" stays 1.8 s, like the DM "Message deleted" toast.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(0), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  // Focus the first item; give focus back on close.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus());
    return () => {
      cancelAnimationFrame(id);
      const back = returnFocus.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [open]);

  // Outside press, scroll, resize, blur → close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onScroll = (e: Event) => { if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return; onClose(); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("contextmenu", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("contextmenu", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [open, onClose]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    switch (e.key) {
      case "ArrowDown": go(i + 1); break;
      case "ArrowUp": go(i - 1); break;
      case "Home": go(0); break;
      case "End": go(items.length - 1); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); onClose(); break;
      case "Tab": e.preventDefault(); onClose(); break;
      default: break;
    }
  };

  const toast = copied && copyToast ? <CopiedToast key={copied} /> : null;
  const shown: Snapshot | null = open ? { actions, placed: placed ?? { left: -9999, top: -9999, origin: "50% 50%" } } : leaving;
  if (!shown) return toast ? <Portal>{toast}</Portal> : null;
  const falling = !open;
  return (
    <Portal>
      <div
        ref={falling ? undefined : ref}
        role="menu"
        aria-label={label}
        aria-hidden={falling || undefined}
        onKeyDown={falling ? undefined : onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className={clsx(
          "fixed z-[70] min-w-48 max-w-[min(280px,calc(100vw-16px))] py-1 rounded-xl bg-card border border-hairline shadow-2xl",
          rise && (falling ? "menu-fall" : placed ? "menu-rise" : null),
        )}
        style={{ left: shown.placed.left, top: shown.placed.top, visibility: open && !placed ? "hidden" : "visible", transformOrigin: shown.placed.origin }}
      >
        {shown.actions.map((a) => (
          <div key={a.key}>
            {a.dividerBefore ? <div role="separator" className="my-1 h-px bg-border-subtle" /> : null}
            <button
              type="button"
              role="menuitem"
              tabIndex={falling ? -1 : undefined}
              onClick={() => { if (falling) return; onClose(); a.onSelect(); if (a.key === "copy") setCopied((n) => n + 1); }}
              className={clsx(
                "flex items-center gap-2.5 w-full px-3 py-2 t-body-md text-left whitespace-nowrap outline-none hover:bg-surface/70 focus-visible:bg-surface/70",
                a.destructive ? "text-error" : "text-primary",
              )}
            >
              {a.icon ? <span className="grid place-items-center w-4 shrink-0">{a.icon}</span> : null}
              <span className="truncate">{a.label}</span>
            </button>
          </div>
        ))}
      </div>
      {toast}
    </Portal>
  );
}

/** The violet check of the DM toasts ("Message deleted", "Copied"). */
export function ToastCheck() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="var(--violet)" />
      <path d="m7.4 12.4 3.1 3.1 6.1-6.6" fill="none" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Copied", in the DM "Message deleted" toast's look: springs in near the
 *  bottom of the screen (above the phone tab bar), gone after 1.8 s. */
function CopiedToast() {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--tabbar-h)+16px)] md:bottom-6 z-[70] pointer-events-none" role="status" aria-live="polite">
      <div className="dm-toast-in flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-surface border border-border-subtle shadow-[0_8px_28px_rgb(0_0_0/0.5)] t-label-md text-primary whitespace-nowrap">
        <ToastCheck />
        Copied
      </div>
    </div>
  );
}

/** What `rowProps` puts on a row (spread it onto the row's element). */
export interface RowMenuProps {
  onContextMenu: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClickCapture: (e: MouseEvent) => void;
}

/**
 * One menu per list: `open*` remembers which row it is for, `rowProps`
 * wires right-click, long press and Shift+F10 on a row, `triggerProps`
 * wires the "⋯".
 */
export function useActionMenu<T>() {
  const [state, setState] = useState<{ target: T; anchor: MenuAnchor } | null>(null);
  const close = useCallback(() => setState(null), []);
  const openAtPoint = useCallback((target: T, x: number, y: number) => setState({ target, anchor: { kind: "point", x, y } }), []);
  const openFrom = useCallback((target: T, el: Element) => setState({ target, anchor: { kind: "rect", rect: el.getBoundingClientRect() } }), []);

  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({ timer: null, x: 0, y: 0, fired: false });
  const cancelPress = () => { if (press.current.timer) clearTimeout(press.current.timer); press.current.timer = null; };

  const rowProps = (target: T): RowMenuProps => ({
    onContextMenu: (e: MouseEvent) => {
      // A link inside the row keeps the browser's own menu.
      if ((e.target as HTMLElement).closest("a[href]")) return;
      e.preventDefault();
      cancelPress();
      openAtPoint(target, e.clientX, e.clientY);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
        e.preventDefault();
        openFrom(target, e.currentTarget);
      }
    },
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      press.current.fired = false;
      press.current.x = e.clientX; press.current.y = e.clientY;
      cancelPress();
      press.current.timer = setTimeout(() => { press.current.fired = true; openAtPoint(target, press.current.x, press.current.y); }, 450);
    },
    onPointerMove: (e: PointerEvent) => {
      if (!press.current.timer) return;
      if (Math.abs(e.clientX - press.current.x) > 10 || Math.abs(e.clientY - press.current.y) > 10) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onClickCapture: (e: MouseEvent) => {
      // The click that ends a long press doesn't also tap the row.
      if (press.current.fired) { e.preventDefault(); e.stopPropagation(); press.current.fired = false; }
    },
  });

  const triggerProps = (target: T) => ({
    "aria-haspopup": "menu" as const,
    "aria-expanded": !!state && Object.is(state.target, target),
    onClick: (e: MouseEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); openFrom(target, e.currentTarget); },
  });

  return { target: state?.target ?? null, anchor: state?.anchor ?? null, close, openAtPoint, openFrom, rowProps, triggerProps };
}

/** The "⋯" button. `hover`: hidden until the row is hovered or focused (chat, DM bubbles). */
export function MoreButton({ hover = false, size = 16, className, label = "More", ...rest }: { hover?: boolean; size?: number; className?: string; label?: string; "aria-haspopup"?: "menu"; "aria-expanded"?: boolean; onClick: (e: MouseEvent<HTMLElement>) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={clsx(
        "grid place-items-center shrink-0 rounded-md text-muted hover:text-primary hover:bg-surface/70 transition-opacity",
        hover && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
        className ?? "size-7",
      )}
    >
      <Ellipsis size={size} />
    </button>
  );
}
