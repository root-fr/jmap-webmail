import { useRef, useCallback, useEffect } from 'react';

interface UseResizeHandleOptions {
  min: number;
  max: number;
  initial: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
}

export function useResizeHandle({ min, max, initial, onResize, onResizeEnd }: UseResizeHandleOptions) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(initial);
  const currentWidth = useRef(initial);
  const suspendedIframes = useRef<Array<{ el: HTMLIFrameElement; prevPointerEvents: string }>>([]);

  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [min, max]);

  // Iframes (e.g. sandboxed email content) capture mouse events in their own
  // document, so a mouseup that happens while the cursor is over one never
  // reaches this document's listeners and the drag appears to get "stuck".
  // Disable pointer events on all iframes for the duration of the drag.
  const suspendIframePointerEvents = useCallback(() => {
    suspendedIframes.current = Array.from(document.querySelectorAll('iframe')).map((el) => ({
      el,
      prevPointerEvents: el.style.pointerEvents,
    }));
    suspendedIframes.current.forEach(({ el }) => {
      el.style.pointerEvents = 'none';
    });
  }, []);

  const restoreIframePointerEvents = useCallback(() => {
    suspendedIframes.current.forEach(({ el, prevPointerEvents }) => {
      el.style.pointerEvents = prevPointerEvents;
    });
    suspendedIframes.current = [];
  }, []);

  useEffect(() => {
    currentWidth.current = initial;
  }, [initial]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const delta = e.clientX - startX.current;
      const newWidth = clamp(startWidth.current + delta);
      currentWidth.current = newWidth;
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      restoreIframePointerEvents();
      onResizeEnd(currentWidth.current);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const touch = e.touches[0];
      const delta = touch.clientX - startX.current;
      const newWidth = clamp(startWidth.current + delta);
      currentWidth.current = newWidth;
      onResize(newWidth);
    };

    const handleTouchEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      restoreIframePointerEvents();
      onResizeEnd(currentWidth.current);
    };

    // Belt-and-suspenders: if the mouse button is released outside the
    // window entirely (or any other way that skips a plain mouseup), still
    // end the drag and restore iframe pointer events on the next enter/blur.
    const handleWindowBlur = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      restoreIframePointerEvents();
      onResizeEnd(currentWidth.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [clamp, onResize, onResizeEnd, restoreIframePointerEvents]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = currentWidth.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    suspendIframePointerEvents();
  }, [suspendIframePointerEvents]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    isDragging.current = true;
    startX.current = touch.clientX;
    startWidth.current = currentWidth.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    suspendIframePointerEvents();
  }, [suspendIframePointerEvents]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = 20;
    let newWidth: number | null = null;

    if (e.key === 'ArrowRight') {
      newWidth = clamp(currentWidth.current + step);
    } else if (e.key === 'ArrowLeft') {
      newWidth = clamp(currentWidth.current - step);
    }

    if (newWidth !== null) {
      e.preventDefault();
      currentWidth.current = newWidth;
      onResize(newWidth);
      onResizeEnd(newWidth);
    }
  }, [clamp, onResize, onResizeEnd]);

  return { handleMouseDown, handleTouchStart, handleKeyDown };
}
