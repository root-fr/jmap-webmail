"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { useConfig } from "@/hooks/use-config";
import { Mail, AlertCircle, Loader2, X } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("login");
  const { login, isLoading, error, clearError, isAuthenticated } = useAuthStore();
  const { appName, jmapServerUrl: serverUrl, isLoading: configLoading, error: configError } = useConfig();

  // All hooks must be called unconditionally at the top
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  const [savedUsernames, setSavedUsernames] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedSuggestion = useRef(false);

  // Set page title
  useEffect(() => {
    if (serverUrl) {
      document.title = appName;
    }
  }, [appName, serverUrl]);

  // Load saved usernames from localStorage on mount
  useEffect(() => {
    if (!serverUrl) return;
    const saved = localStorage.getItem("webmail_usernames");
    if (saved) {
      try {
        const usernames = JSON.parse(saved);
        setSavedUsernames(usernames);
      } catch {
        console.error("Failed to parse saved usernames");
      }
    }
  }, [serverUrl]);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    clearError();
  }, [formData, clearError]);

  // Filter suggestions based on input
  useEffect(() => {
    if (!serverUrl) return;
    // Skip showing suggestions if we just selected one
    if (justSelectedSuggestion.current) {
      justSelectedSuggestion.current = false;
      return;
    }

    if (formData.username && savedUsernames.length > 0) {
      const filtered = savedUsernames.filter(username =>
        username.toLowerCase().includes(formData.username.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else if (formData.username === "" && savedUsernames.length > 0) {
      setFilteredSuggestions(savedUsernames);
      setShowSuggestions(false); // Don't show on empty input
    } else {
      setShowSuggestions(false);
    }
    setSelectedSuggestionIndex(-1);
  }, [formData.username, savedUsernames, serverUrl]);

  // Close suggestions when clicking outside
  useEffect(() => {
    if (!serverUrl) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [serverUrl]);

  // Show loading state while config is being fetched
  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <div className="w-full max-w-sm mx-auto px-4 text-center" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <span className="sr-only">{t("loading")}</span>
        </div>
      </div>
    );
  }

  // Show error if config fetch failed
  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <div className="w-full max-w-sm mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-medium text-foreground mb-2">{t("config_error.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("config_error.fetch_failed")}
          </p>
        </div>
      </div>
    );
  }

  // Show error if JMAP server URL is not configured
  if (!serverUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <div className="w-full max-w-sm mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-xl font-medium text-foreground mb-2">{t("config_error.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("config_error.server_not_configured")}
          </p>
        </div>
      </div>
    );
  }

  // Save username on successful login
  const saveUsername = (username: string) => {
    const saved = localStorage.getItem("webmail_usernames");
    let usernames: string[] = [];

    if (saved) {
      try {
        usernames = JSON.parse(saved);
      } catch {
        console.error("Failed to parse saved usernames");
      }
    }

    // Add username if not already present, keep max 5 recent usernames
    if (!usernames.includes(username)) {
      usernames = [username, ...usernames].slice(0, 5);
      localStorage.setItem("webmail_usernames", JSON.stringify(usernames));
      setSavedUsernames(usernames);
    }
  };

  // Remove a username from saved list
  const removeUsername = (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedUsernames.filter(u => u !== username);
    localStorage.setItem("webmail_usernames", JSON.stringify(updated));
    setSavedUsernames(updated);
    setFilteredSuggestions(updated.filter(u =>
      u.toLowerCase().includes(formData.username.toLowerCase())
    ));
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, username: e.target.value });
  };

  const handleUsernameFocus = () => {
    if (savedUsernames.length > 0 && formData.username === "") {
      setFilteredSuggestions(savedUsernames);
      setShowSuggestions(true);
    } else if (filteredSuggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const selectSuggestion = (username: string) => {
    justSelectedSuggestion.current = true;
    setFormData({ ...formData, username });
    setShowSuggestions(false);
    // Focus password field
    document.getElementById("password")?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || filteredSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex(prev =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === "Enter" && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const success = await login(
      serverUrl,
      formData.username,
      formData.password
    );

    if (success) {
      saveUsername(formData.username);
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <div className="w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 mb-6 shadow-lg shadow-primary/5">
            <Mail className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-light text-foreground tracking-tight">
            {appName}
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">
              {t(`error.${error}`) || t("error.generic")}
            </p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="relative">
              <Input
                ref={inputRef}
                id="username"
                type="text"
                value={formData.username}
                onChange={handleUsernameChange}
                onFocus={handleUsernameFocus}
                onKeyDown={handleKeyDown}
                className="h-12 px-4 bg-secondary/50 border-border/50 focus:bg-secondary focus:border-primary/50 transition-colors"
                placeholder={t("username_placeholder")}
                required
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                autoFocus
              />

              {/* Custom autocomplete dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full mt-1 w-full bg-secondary border border-border rounded-md shadow-lg z-50 overflow-hidden"
                >
                  {filteredSuggestions.map((username, index) => (
                    <div
                      key={username}
                      className={`px-4 py-2.5 flex items-center justify-between hover:bg-muted cursor-pointer transition-colors ${
                        index === selectedSuggestionIndex ? "bg-muted" : ""
                      }`}
                      onClick={() => selectSuggestion(username)}
                    >
                      <span className="text-sm text-foreground">{username}</span>
                      <button
                        type="button"
                        onClick={(e) => removeUsername(username, e)}
                        className="p-1 hover:bg-background rounded transition-colors"
                        title={t("remove_from_history")}
                      >
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="h-12 px-4 bg-secondary/50 border-border/50 focus:bg-secondary focus:border-primary/50 transition-colors"
              placeholder={t("password_placeholder")}
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 font-medium text-base bg-primary hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/20"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("signing_in")}
              </div>
            ) : (
              t("sign_in")
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}