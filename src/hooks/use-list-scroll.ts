import { useCallback, useRef, type UIEvent } from "react";

// Keep each query's list position while its parent displays a detail or composer.
export function useListScroll(queryKey: string) {
  const positions = useRef(new Map<string, { top: number; left: number }>());
  const viewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport) return;
      const saved = positions.current.get(queryKey);
      viewport.scrollTop = saved?.top ?? 0;
      viewport.scrollLeft = saved?.left ?? 0;
    },
    [queryKey]
  );
  const onViewportScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      positions.current.set(queryKey, {
        top: event.currentTarget.scrollTop,
        left: event.currentTarget.scrollLeft,
      });
    },
    [queryKey]
  );
  return { viewportRef, onViewportScroll };
}
