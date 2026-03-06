import { useRef, useCallback } from 'react';

export function useResizablePanel(
  panelRef: React.RefObject<HTMLElement>,
  onResize?: () => void,
  minHeight = 36,
  maxHeightFraction = 0.8
) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!panelRef.current) return;
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = panelRef.current.offsetHeight;

      function onMove(ev: MouseEvent) {
        if (!dragging.current || !panelRef.current) return;
        const delta = startY.current - ev.clientY;
        const maxH = window.innerHeight * maxHeightFraction;
        const newH = Math.min(maxH, Math.max(minHeight, startH.current + delta));
        panelRef.current.style.height = `${newH}px`;
        if (onResize) onResize();
      }

      function onUp() {
        dragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [panelRef, onResize, minHeight, maxHeightFraction]
  );

  return { onMouseDown };
}
