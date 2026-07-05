import { useEffect, useRef, RefObject } from 'react';

interface UseMenuKeyboardOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  restoreFocus?: boolean;
}

export function useMenuKeyboard({
  isOpen,
  containerRef,
  onClose,
  restoreFocus = true,
}: UseMenuKeyboardOptions) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getItems = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'
        )
      );

    getItems()[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      const items = getItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          items[current < 0 ? 0 : (current + 1) % items.length].focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          items[current <= 0 ? items.length - 1 : current - 1].focus();
          break;
        case 'Home':
          e.preventDefault();
          items[0].focus();
          break;
        case 'End':
          e.preventDefault();
          items[items.length - 1].focus();
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus) previouslyFocused?.focus();
    };
  }, [isOpen, containerRef, restoreFocus]);
}
