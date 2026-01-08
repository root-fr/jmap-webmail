"use client";

import { Menu, ArrowLeft, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onCompose?: () => void;
  onSearch?: () => void;
  className?: string;
}

export function MobileHeader({
  title,
  showBack = false,
  onBack,
  onCompose,
  onSearch,
  className,
}: MobileHeaderProps) {
  const { toggleSidebar, goBack, sidebarOpen } = useUIStore();

  const handleLeftAction = () => {
    if (showBack && onBack) {
      onBack();
    } else if (showBack) {
      goBack();
    } else {
      toggleSidebar();
    }
  };

  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 h-14 border-b border-border bg-background shrink-0",
        "lg:hidden", // Only visible on mobile/tablet
        className
      )}
    >
      {/* Left action: Menu or Back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLeftAction}
          className="h-10 w-10"
          aria-label={showBack ? "Go back" : "Toggle menu"}
        >
          {showBack ? (
            <ArrowLeft className="h-5 w-5" />
          ) : sidebarOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>

        {/* Title */}
        <h1 className="font-semibold text-lg truncate">{title}</h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {onSearch && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSearch}
            className="h-10 w-10"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>
        )}
        {onCompose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCompose}
            className="h-10 w-10 text-primary"
            aria-label="Compose"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </div>
    </header>
  );
}

/**
 * Viewer header for mobile - shows when viewing an email
 */
interface MobileViewerHeaderProps {
  subject?: string;
  onBack: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  className?: string;
}

export function MobileViewerHeader({
  subject,
  onBack,
  onDelete: _onDelete,
  onArchive: _onArchive,
  className,
}: MobileViewerHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-2 h-14 border-b border-border bg-background shrink-0",
        "lg:hidden", // Only visible on mobile/tablet
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        className="h-10 w-10"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <h1 className="flex-1 font-medium text-sm truncate px-2 text-center">
        {subject || "(No Subject)"}
      </h1>

      <div className="flex items-center">
        {/* Placeholder for additional actions - kept minimal */}
        <div className="w-10" />
      </div>
    </header>
  );
}
