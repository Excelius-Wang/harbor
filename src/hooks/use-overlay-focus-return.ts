import { useRef } from "react";

type AutoFocusHandler = (event: Event) => void;

// Controlled overlays often open from a page action without a Radix Trigger.
export function useOverlayFocusReturn({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: AutoFocusHandler;
  onCloseAutoFocus?: AutoFocusHandler;
}) {
  const openers = useRef<HTMLElement[]>([]);
  return {
    onOpenAutoFocus(event: Event) {
      const active = document.activeElement;
      openers.current = [];
      let opener = active instanceof HTMLElement && active !== document.body ? active : null;
      while (opener && !openers.current.includes(opener)) {
        openers.current.push(opener);
        // A menu item disappears when it opens another overlay. Retain its trigger too.
        const menu = opener.closest('[role="menu"][aria-labelledby]');
        const triggerId = menu?.getAttribute("aria-labelledby")?.split(/\s+/)[0];
        const trigger = triggerId ? document.getElementById(triggerId) : null;
        opener = trigger instanceof HTMLElement ? trigger : null;
      }
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      for (const opener of openers.current) {
        if (!opener.isConnected) continue;
        opener.focus({ preventScroll: true });
        if (document.activeElement === opener) {
          event.preventDefault();
          break;
        }
      }
    },
  };
}
