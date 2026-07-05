"use client";

import { forwardRef, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useMenuKeyboard } from "@/hooks/use-menu-keyboard";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: Position;
  onClose: () => void;
  children: React.ReactNode;
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ isOpen, position, onClose, children }, ref) => {
    const [mounted, setMounted] = useState(false);
    const innerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setMounted(true);
    }, []);

    useMenuKeyboard({ isOpen: isOpen && mounted, containerRef: innerRef, onClose });

    if (!mounted || !isOpen) return null;

    return createPortal(
      <div
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(
          "fixed z-50 min-w-[200px] bg-background rounded-md shadow-lg border border-border",
          "animate-in fade-in-0 zoom-in-95 duration-100"
        )}
        style={{
          left: position.x,
          top: position.y,
        }}
        role="menu"
        aria-orientation="vertical"
      >
        <div className="py-1">
          {children}
        </div>
      </div>,
      document.body
    );
  }
);

ContextMenu.displayName = "ContextMenu";

interface ContextMenuItemProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
  style?: React.CSSProperties;
}

export function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  destructive = false,
  shortcut,
  style,
}: ContextMenuItemProps) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      style={style}
      className={cn(
        "w-full px-3 py-2 text-sm text-left flex items-center gap-2",
        "transition-colors duration-100",
        "focus:outline-none focus:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "hover:bg-muted cursor-pointer",
        destructive && !disabled && "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
      )}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onClick();
      }}
    >
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-xs text-muted-foreground ml-auto">{shortcut}</span>
      )}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="h-px bg-border my-1" role="separator" />;
}

interface ContextMenuSubMenuProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}

export function ContextMenuSubMenu({
  icon: Icon,
  label,
  children,
}: ContextMenuSubMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [subMenuPosition, setSubMenuPosition] = useState<"right" | "left">("right");
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (isOpen && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      if (rect.right + 200 > viewportWidth - 10) {
        setSubMenuPosition("left");
      } else {
        setSubMenuPosition("right");
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => clearTimeout(closeTimerRef.current ?? undefined);
  }, []);

  const handleMouseEnter = () => {
    if (isTouchDevice) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (isTouchDevice) return;
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleClick = () => {
    if (isTouchDevice) {
      setIsOpen(prev => !prev);
    }
  };

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          "w-full px-3 py-2 text-sm flex items-center gap-2",
          "transition-colors duration-100 cursor-pointer",
          "hover:bg-muted focus:outline-none focus:bg-muted"
        )}
        role="menuitem"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(true);
          } else if (e.key === "ArrowLeft") {
            e.stopPropagation();
            setIsOpen(false);
          }
        }}
      >
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        <span className="flex-1">{label}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>

      {isOpen && (
        <div
          ref={subMenuRef}
          className={cn(
            "absolute top-0 min-w-[180px] bg-background rounded-md shadow-lg border border-border",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            subMenuPosition === "right" ? "left-full" : "right-full"
          )}
          role="menu"
        >
          <div className="py-1 max-h-[300px] overflow-y-auto">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

interface ContextMenuHeaderProps {
  children: React.ReactNode;
}

export function ContextMenuHeader({ children }: ContextMenuHeaderProps) {
  return (
    <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
      {children}
    </div>
  );
}
