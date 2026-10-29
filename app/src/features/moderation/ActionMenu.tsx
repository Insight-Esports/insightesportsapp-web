// moderation/ActionMenu.tsx — the one context menu behind every message,
// comment and person (iOS .contextMenu / Menu). On the web the hover "⋯"
// and a right-click (contextmenu) open the same menu; a long press does on
// touch screens; Shift+F10 / the Menu key on a focused row, or Enter on the
// "⋯", from the keyboard. Arrow keys move, Enter picks, Esc closes and
// hands focus back. Portaled to <body> so a sheet or a scroller never
// clips it.
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

export function ActionMenu({ anchor, actions, onClose, label = "Actions" }: { anchor: MenuAnchor | null; actions: MenuAction[]; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = !!anchor && actions.length > 0;

  // Place it at the pointer, or under the "⋯" (right edges aligned), kept on screen.
  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
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
    setPos({ left: Math.max(m, left), top: Math.max(m, top) });
  }, [open, anchor]);

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

  if (!open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-[70] min-w-48 max-w-[min(280px,calc(100vw-16px))] py-1 rounded-xl bg-card border border-hairline shadow-2xl"
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
      >
        {actions.map((a) => (
          <div key={a.key}>
            {a.dividerBefore ? <div role="separator" className="my-1 h-px bg-border-subtle" /> : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => { onClose(); a.onSelect(); }}
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
    </Portal>
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
