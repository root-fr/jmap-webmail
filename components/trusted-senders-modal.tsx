"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { X, ShieldCheck, Search, Trash2, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

interface TrustedSendersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TrustedSendersModal({ isOpen, onClose }: TrustedSendersModalProps) {
  const t = useTranslations("settings.email_behavior.trusted_senders");
  const inputRef = useRef<HTMLInputElement>(null);

  const { trustedSenders, addTrustedSender, removeTrustedSender } = useSettingsStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  // Filter senders based on search query
  const filteredSenders = useMemo(() => {
    if (!searchQuery.trim()) return trustedSenders;
    const query = searchQuery.toLowerCase();
    return trustedSenders.filter((email) => email.toLowerCase().includes(query));
  }, [trustedSenders, searchQuery]);

  // Show search only when 5+ senders
  const showSearch = trustedSenders.length >= 5;

  const handleEscape = useCallback(() => {
    if (isAdding) {
      setIsAdding(false);
      setNewEmail("");
      setEmailError("");
    } else {
      onClose();
    }
  }, [isAdding, onClose]);

  const modalRef = useFocusTrap({ isActive: isOpen, onEscape: handleEscape });

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose, modalRef]);

  // Focus input when adding mode is enabled
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setIsAdding(false);
      setNewEmail("");
      setEmailError("");
    }
  }, [isOpen]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddSender = () => {
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setEmailError(t("invalid_email"));
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setEmailError(t("invalid_email"));
      return;
    }

    if (trustedSenders.includes(trimmedEmail)) {
      setEmailError(t("already_added"));
      return;
    }

    addTrustedSender(trimmedEmail);
    setNewEmail("");
    setIsAdding(false);
    setEmailError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddSender();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trusted-senders-title"
        className={cn(
          "bg-background border border-border rounded-lg shadow-xl",
          "w-full max-w-md max-h-[60vh] overflow-hidden flex flex-col",
          "animate-in zoom-in-95 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 id="trusted-senders-title" className="text-lg font-semibold text-foreground">
              {t("modal_title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search (only when 5+ senders) */}
        {showSearch && (
          <div className="px-6 py-3 border-b border-border flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("search_placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {trustedSenders.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <ShieldCheck className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-base font-medium text-foreground mb-2">
                {t("empty_title")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-[280px] mb-6">
                {t("empty_description")}
              </p>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {t("add_manually")}
              </button>
            </div>
          ) : filteredSenders.length === 0 ? (
            /* No search results */
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <Search className="w-10 h-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("no_results")}
              </p>
            </div>
          ) : (
            /* Sender list */
            <div className="divide-y divide-border">
              {filteredSenders.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <Avatar email={email} size="sm" />
                  <span className="flex-1 text-sm text-foreground truncate">
                    {email}
                  </span>
                  <button
                    onClick={() => removeTrustedSender(email)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`${t("remove")} ${email}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Add sender */}
        {trustedSenders.length > 0 && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0">
            {isAdding ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="email"
                    placeholder={t("add_placeholder")}
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setEmailError("");
                    }}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50",
                      emailError ? "border-destructive" : "border-border"
                    )}
                  />
                  <button
                    onClick={handleAddSender}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
                  >
                    {t("add_button")}
                  </button>
                </div>
                {emailError && (
                  <p className="text-xs text-destructive">{emailError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("add_manually")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
