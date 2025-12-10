"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuState<T> {
  isOpen: boolean;
  position: Position;
  data: T | null;
}

interface UseContextMenuReturn<T> {
  contextMenu: ContextMenuState<T>;
  openContextMenu: (e: React.MouseEvent, data: T) => void;
  closeContextMenu: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT = 320; // Approximate max height

export function useContextMenu<T>(): UseContextMenuReturn<T> {
  const [contextMenu, setContextMenu] = useState<ContextMenuState<T>>({
    isOpen: false,
    position: { x: 0, y: 0 },
    data: null,
  });

  const menuRef = useRef<HTMLDivElement | null>(null);

  const calculatePosition = useCallback((clientX: number, clientY: number): Position => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = clientX;
    let y = clientY;

    // Adjust for right edge
    if (x + MENU_WIDTH > viewportWidth - 10) {
      x = viewportWidth - MENU_WIDTH - 10;
    }

    // Adjust for bottom edge
    if (y + MENU_HEIGHT > viewportHeight - 10) {
      y = viewportHeight - MENU_HEIGHT - 10;
    }

    // Ensure minimum position
    x = Math.max(10, x);
    y = Math.max(10, y);

    return { x, y };
  }, []);

  const openContextMenu = useCallback((e: React.MouseEvent, data: T) => {
    e.preventDefault();
    e.stopPropagation();

    const position = calculatePosition(e.clientX, e.clientY);

    setContextMenu({
      isOpen: true,
      position,
      data,
    });
  }, [calculatePosition]);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  // Close on escape key, click outside, and scroll
  useEffect(() => {
    if (!contextMenu.isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeContextMenu();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleScroll = () => {
      closeContextMenu();
    };

    const handleBlur = () => {
      closeContextMenu();
    };

    // Add listeners with a slight delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("scroll", handleScroll, true);
      window.addEventListener("blur", handleBlur);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [contextMenu.isOpen, closeContextMenu]);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    menuRef,
  };
}
