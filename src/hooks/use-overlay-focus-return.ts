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
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (!event.defaultPrevented && opener.current?.isConnected) {
        opener.current.focus({ preventScroll: true });
        if (document.activeElement === opener.current) event.preventDefault();
      }
    },
  };
}
