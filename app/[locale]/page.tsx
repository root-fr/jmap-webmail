"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Sidebar } from "@/components/layout/sidebar";
import { EmailList } from "@/components/email/email-list";
import { EmailViewer } from "@/components/email/email-viewer";
import { EmailComposer } from "@/components/email/email-composer";
import { ThreadConversationView } from "@/components/email/thread-conversation-view";
import { MobileHeader, MobileViewerHeader } from "@/components/layout/mobile-header";
import { ThreadGroup, Email } from "@/lib/jmap/types";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { useEmailStore } from "@/stores/email-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useIdentityStore } from "@/stores/identity-store";
import { useUIStore } from "@/stores/ui-store";
import { useContactStore } from "@/stores/contact-store";
import { useDeviceDetection } from "@/hooks/use-media-query";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { debug } from "@/lib/debug";
import { playNotificationSound } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";
import {
  ErrorBoundary,
  SidebarErrorFallback,
  EmailListErrorFallback,
  EmailViewerErrorFallback,
  ComposerErrorFallback,
} from "@/components/error";
import { DragDropProvider } from "@/contexts/drag-drop-context";
import { AdvancedSearchPanel } from "@/components/search/advanced-search-panel";
import { isFilterEmpty } from "@/lib/jmap/search-utils";
import { WelcomeBanner } from "@/components/ui/welcome-banner";
import { NavigationRail } from "@/components/layout/navigation-rail";
import { useFaviconBadge } from "@/hooks/use-favicon-badge";

export default function Home() {
  const router = useRouter();
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<'compose' | 'reply' | 'replyAll' | 'forward'>('compose');
  const [composerDraftText, setComposerDraftText] = useState("");
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  // Mobile conversation view state
  const [conversationThread, setConversationThread] = useState<ThreadGroup | null>(null);
  const [conversationEmails, setConversationEmails] = useState<Email[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const markAsReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { isAuthenticated, client, logout, checkAuth, isLoading: authLoading } = useAuthStore();
  const { identities } = useIdentityStore();

  // Mobile/tablet responsive hooks
  const { isMobile, isTablet } = useDeviceDetection();
  const { activeView, sidebarOpen, setSidebarOpen, setActiveView, tabletListVisible, setTabletListVisible } = useUIStore();
  const {
    emails,
    mailboxes,
    selectedEmail,
    selectedMailbox,
    quota,
    isPushConnected,
    newEmailNotification,
    selectEmail,
    selectMailbox,
    selectAllEmails,
    clearSelection,
    fetchMailboxes,
    fetchEmails,
    fetchQuota,
    sendEmail,
    deleteEmail,
    markAsRead,
    toggleStar,
    moveToMailbox,
    searchEmails,
    searchQuery,
    setSearchQuery,
    isLoading,
    isLoadingEmail,
    setLoadingEmail,
    setPushConnected,
    handleStateChange,
    refreshCurrentMailbox,
    clearNewEmailNotification,
    markAsSpam,
    undoSpam,
    searchFilters,
    isAdvancedSearchOpen,
    setSearchFilters,
    clearSearchFilters,
    toggleAdvancedSearch,
    advancedSearch,
    fetchTagCounts,
  } = useEmailStore();

  const contactStore = useContactStore();

  const inboxUnread = mailboxes.find(m => m.role === "inbox")?.unreadEmails || 0;
  useFaviconBadge(inboxUnread);

  // Keyboard shortcuts handlers
  const keyboardHandlers = useMemo(() => ({
    onNextEmail: () => {
      if (emails.length === 0) return;
      const currentIndex = selectedEmail ? emails.findIndex(e => e.id === selectedEmail.id) : -1;
      const nextIndex = currentIndex < emails.length - 1 ? currentIndex + 1 : currentIndex;
      if (nextIndex >= 0 && nextIndex < emails.length) {
        handleEmailSelect(emails[nextIndex]);
      }
    },
    onPreviousEmail: () => {
      if (emails.length === 0) return;
      const currentIndex = selectedEmail ? emails.findIndex(e => e.id === selectedEmail.id) : emails.length;
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      if (prevIndex >= 0 && prevIndex < emails.length) {
        handleEmailSelect(emails[prevIndex]);
      }
    },
    onOpenEmail: () => {
      // Email is already opened when selected
    },
    onCloseEmail: () => {
      dismissViewer();
    },
    onReply: () => {
      if (selectedEmail) handleReply();
    },
    onReplyAll: () => {
      if (selectedEmail) handleReplyAll();
    },
    onForward: () => {
      if (selectedEmail) handleForward();
    },
    onToggleStar: () => {
      if (selectedEmail) handleToggleStar();
    },
    onArchive: () => {
      if (selectedEmail) handleArchive();
    },
    onDelete: () => {
      if (selectedEmail) handleDelete();
    },
    onMarkAsUnread: async () => {
      if (selectedEmail && client) {
        await markAsRead(client, selectedEmail.id, false);
      }
    },
    onMarkAsRead: async () => {
      if (selectedEmail && client) {
        await markAsRead(client, selectedEmail.id, true);
      }
    },
    onToggleSpam: () => {
      if (selectedEmail) {
        // Check if we're in junk folder
        const currentMailbox = mailboxes.find(m => m.id === selectedMailbox);
        const isInJunk = currentMailbox?.role === 'junk';
        if (isInJunk) {
          handleUndoSpam();
        } else {
          handleMarkAsSpam();
        }
      }
    },
    onCompose: () => {
      setComposerMode('compose');
      setShowComposer(true);
    },
    onFocusSearch: () => {
      const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },
    onShowHelp: () => {
      setShowShortcutsModal(true);
    },
    onRefresh: async () => {
      if (client && selectedMailbox) {
        await fetchEmails(client, selectedMailbox);
      }
    },
    onSelectAll: () => {
      selectAllEmails();
    },
    onDeselectAll: () => {
      clearSelection();
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated each render; only rememoize on data/layout changes
  }), [emails, selectedEmail, client, selectedMailbox, isMobile, isTablet]);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    enabled: isAuthenticated && !showComposer,
    emails,
    selectedEmailId: selectedEmail?.id,
    handlers: keyboardHandlers,
  });

  // Update page title based on context
  useEffect(() => {
    let title = tCommon('app_title');

    if (showComposer) {
      // Composing email
      const modeText = {
        compose: t('email_composer.new_message'),
        reply: t('email_composer.reply'),
        replyAll: t('email_composer.reply_all'),
        forward: t('email_composer.forward'),
      }[composerMode] || t('email_composer.new_message');
      title = `${modeText} - ${tCommon('app_title')}`;
    } else if (selectedEmail) {
      // Reading email
      const subject = selectedEmail.subject || t('email_viewer.no_subject');
      title = `${subject} - ${tCommon('app_title')}`;
    } else if (selectedMailbox && mailboxes.length > 0) {
      // Mailbox view
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      if (mailbox) {
        const mailboxName = mailbox.name;
        const unreadCount = mailbox.unreadEmails || 0;
        title = unreadCount > 0
          ? `${mailboxName} (${unreadCount}) - ${tCommon('app_title')}`
          : `${mailboxName} - ${tCommon('app_title')}`;
      }
    }

    document.title = title;
  }, [showComposer, composerMode, selectedEmail, selectedMailbox, mailboxes, t, tCommon]);

  // Check auth on mount
  useEffect(() => {
    checkAuth().finally(() => {
      setInitialCheckDone(true);
    });
  }, [checkAuth]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (initialCheckDone && !isAuthenticated && !authLoading) {
      router.push('/login');
    }
  }, [initialCheckDone, isAuthenticated, authLoading, router]);

  // Load mailboxes and emails when authenticated (only if not already loaded)
  useEffect(() => {
    if (isAuthenticated && client && mailboxes.length === 0) {
      const loadData = async () => {
        try {
          // First fetch mailboxes and quota (inbox will be auto-selected in fetchMailboxes)
          await Promise.all([
            fetchMailboxes(client),
            fetchQuota(client)
          ]);

          // Get the selected mailbox (should be inbox by default)
          const state = useEmailStore.getState();
          const selectedMailboxId = state.selectedMailbox;

          // Fetch emails for the selected mailbox
          if (selectedMailboxId) {
            await fetchEmails(client, selectedMailboxId);
          } else {
            await fetchEmails(client);
          }

          // Fetch tag counts in the background
          fetchTagCounts(client);

          // Setup push notifications after successful data load
          try {
            // Register state change callback
            client.onStateChange((change) => handleStateChange(change, client));

            // Start receiving push notifications
            const pushEnabled = client.setupPushNotifications();

            if (pushEnabled) {
              setPushConnected(true);
              debug.log('[Push] Push notifications successfully enabled');
            } else {
              debug.log('[Push] Push notifications not available on this server');
            }
          } catch (error) {
            // Push notifications are optional - don't break the app if they fail
            debug.log('[Push] Failed to setup push notifications:', error);
          }
        } catch {
          return;
        }
      };
      loadData();
    }

    // Cleanup push notifications on unmount
    return () => {
      if (client) {
        client.closePushNotifications();
      }
    };
  }, [isAuthenticated, client, mailboxes.length, fetchMailboxes, fetchEmails, fetchQuota, fetchTagCounts, handleStateChange, setPushConnected]);

  // Handle mark-as-read with delay based on settings
  useEffect(() => {
    // Clear any existing timeout when email changes
    if (markAsReadTimeoutRef.current) {
      debug.log('[Mark as Read] Clearing previous timeout');
      clearTimeout(markAsReadTimeoutRef.current);
      markAsReadTimeoutRef.current = null;
    }

    // Only set timeout if there's a selected email, it's unread, and we have a client
    if (!selectedEmail || !client || selectedEmail.keywords?.$seen) {
      return;
    }

    // Get current setting value
    const markAsReadDelay = useSettingsStore.getState().markAsReadDelay;
    debug.log('[Mark as Read] Delay setting:', markAsReadDelay, 'ms for email:', selectedEmail.id);

    if (markAsReadDelay === -1) {
      // Never mark as read automatically
      debug.log('[Mark as Read] Never mode - email will stay unread');
    } else if (markAsReadDelay === 0) {
      // Mark as read instantly
      debug.log('[Mark as Read] Instant mode - marking as read now');
      markAsRead(client, selectedEmail.id, true);
    } else {
      // Mark as read after delay
      debug.log('[Mark as Read] Delayed mode - will mark as read in', markAsReadDelay, 'ms');
      markAsReadTimeoutRef.current = setTimeout(() => {
        debug.log('[Mark as Read] Timeout fired - marking as read now');
        markAsRead(client, selectedEmail.id, true);
        markAsReadTimeoutRef.current = null;
      }, markAsReadDelay);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (markAsReadTimeoutRef.current) {
        debug.log('[Mark as Read] Cleanup - clearing timeout');
        clearTimeout(markAsReadTimeoutRef.current);
        markAsReadTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark-as-read triggers only on email selection, not on config changes
  }, [selectedEmail?.id]);

  // Handle new email notifications - play sound
  useEffect(() => {
    if (newEmailNotification) {
      playNotificationSound();
      debug.log('New email received:', newEmailNotification.subject);
      clearNewEmailNotification();
    }
  }, [newEmailNotification, clearNewEmailNotification]);

  // Lock body scroll when sidebar is open on mobile/tablet
  useEffect(() => {
    if ((isMobile || isTablet) && sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, isTablet, sidebarOpen]);

  // Reset tablet list visibility when crossing to desktop
  useEffect(() => {
    if (!isMobile && !isTablet) {
      setTabletListVisible(true);
    }
  }, [isMobile, isTablet, setTabletListVisible]);

  const handleEmailSend = async (data: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    draftId?: string;
    fromEmail?: string;
    fromName?: string;
    identityId?: string;
  }) => {
    if (!client) return;

    try {
      await sendEmail(client, data.to, data.subject, data.body, data.cc, data.bcc, data.identityId, data.fromEmail, data.draftId, data.fromName);
      setShowComposer(false);

      // Silent refresh — no loading indicator flash
      await refreshCurrentMailbox(client);
    } catch {
      return;
    }
  };

  const handleDiscardDraft = async (draftId: string) => {
    if (!client) return;

    try {
      await client.deleteEmail(draftId);
    } catch {
      return;
    }
  };

  const handleReply = (draftText?: string) => {
    setComposerDraftText(draftText || "");
    setComposerMode('reply');
    setShowComposer(true);
  };

  const handleReplyAll = () => {
    setComposerMode('replyAll');
    setShowComposer(true);
  };

  const handleForward = () => {
    setComposerMode('forward');
    setShowComposer(true);
  };

  const dismissViewer = () => {
    selectEmail(null);
    if (isMobile) setActiveView("list");
    if (isTablet) setTabletListVisible(true);
  };

  const handleDelete = async () => {
    if (!client || !selectedEmail) return;

    try {
      await deleteEmail(client, selectedEmail.id);
      dismissViewer();
    } catch {
      return;
    }
  };

  const handleArchive = async () => {
    if (!client || !selectedEmail) return;

    // Find archive mailbox
    const archiveMailbox = mailboxes.find(m => m.role === "archive" || m.name.toLowerCase() === "archive");
    if (archiveMailbox) {
      try {
        await moveToMailbox(client, selectedEmail.id, archiveMailbox.id);
        dismissViewer();
      } catch {
        return;
      }
    }
  };

  const handleToggleStar = async () => {
    if (!client || !selectedEmail) return;

    try {
      await toggleStar(client, selectedEmail.id);
    } catch {
      return;
    }
  };

  const handleMarkAsSpam = async () => {
    if (!client || !selectedEmail) return;

    const emailId = selectedEmail.id;

    try {
      await markAsSpam(client, emailId);

      const toastInstance = (await import('sonner')).toast;
      toastInstance.success(t('email_viewer.spam.toast_success'), {
        action: {
          label: t('email_viewer.spam.toast_undo'),
          onClick: async () => {
            try {
              await undoSpam(client, emailId);
              toastInstance.success(t('notifications.email_moved'));
            } catch {
              toastInstance.error(t('email_viewer.spam.error'));
            }
          },
        },
        duration: 5000,
      });
    } catch {
      const toastInstance = (await import('sonner')).toast;
      toastInstance.error(t('email_viewer.spam.error'));
    }
  };

  const handleUndoSpam = async () => {
    if (!client || !selectedEmail) return;

    try {
      await undoSpam(client, selectedEmail.id);

      const toastInstance = (await import('sonner')).toast;
      toastInstance.success(t('email_viewer.spam.toast_not_spam_success'));

      // Deselect email after moving it out of junk
      selectEmail(null);
    } catch {
      const toastInstance = (await import('sonner')).toast;
      toastInstance.error(t('email_viewer.spam.error_not_spam'));
    }
  };

  const handleSetColorTag = async (emailId: string, color: string | null) => {
    if (!client) return;

    try {
      // Remove any existing color tags
      const email = emails.find(e => e.id === emailId);
      if (!email) return;

      const keywords = { ...email.keywords };

      // Remove old color tags - set to false for JMAP to remove them
      Object.keys(keywords).forEach(key => {
        if (key.startsWith("$color:")) {
          keywords[key] = false;
        }
      });

      // Add new color tag if specified
      if (color) {
        keywords[`$color:${color}`] = true;
      }

      // Update email keywords via JMAP
      await client.updateEmailKeywords(emailId, keywords);

      // Update local state
      selectEmail(email.id === selectedEmail?.id ? { ...email, keywords } : selectedEmail);

      // Silent refresh to show color in list
      await refreshCurrentMailbox(client);
    } catch {
      return;
    }
  };

  const handleMailboxSelect = async (mailboxId: string) => {
    selectMailbox(mailboxId);
    selectEmail(null); // Clear selected email when switching mailboxes

    // On mobile, close sidebar and go to list view
    if (isMobile) {
      setSidebarOpen(false);
      setActiveView("list");
    }

    // On tablet, show the list again
    if (isTablet) {
      setTabletListVisible(true);
    }

    if (client) {
      // If there's an active search, re-run it in the new mailbox
      if (searchQuery) {
        await searchEmails(client, searchQuery);
      } else {
        await fetchEmails(client, mailboxId);
      }
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleSearch = async (query: string) => {
    if (!client) return;
    setSearchQuery(query);
    if (!isFilterEmpty(searchFilters)) {
      await advancedSearch(client);
    } else {
      await searchEmails(client, query);
    }
  };

  const handleClearSearch = async () => {
    setSearchQuery("");
    clearSearchFilters();
    if (client && selectedMailbox) {
      await fetchEmails(client, selectedMailbox);
    }
  };

  const handleAdvancedSearch = async () => {
    if (!client) return;
    await advancedSearch(client);
  };

  const handleDownloadAttachment = async (blobId: string, name: string, type?: string) => {
    if (!client) return;

    try {
      await client.downloadBlob(blobId, name, type);
    } catch {
      return;
    }
  };

  const handleQuickReply = async (body: string) => {
    if (!client || !selectedEmail) return;

    const sender = selectedEmail.from?.[0];
    if (!sender?.email) {
      throw new Error("No sender email found");
    }

    const primaryIdentity = identities[0];

    // Send reply with just the body text
    await sendEmail(
      client,
      [sender.email],
      `Re: ${selectedEmail.subject || "(no subject)"}`,
      body,
      undefined,
      undefined,
      primaryIdentity?.id,
      primaryIdentity?.email,
      undefined,
      primaryIdentity?.name || undefined
    );

    // Silent refresh to show the sent reply
    await refreshCurrentMailbox(client);
  };

  // Show loading state while checking auth
  if (!initialCheckDone || authLoading || (!isAuthenticated || !client)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Get current mailbox name for mobile header
  const currentMailboxName = mailboxes.find(m => m.id === selectedMailbox)?.name || "Inbox";

  // Handle email selection with mobile view switching
  const handleEmailSelect = async (email: { id: string }) => {
    if (!client || !email) return;

    // Set loading state immediately (keep current email visible)
    setLoadingEmail(true);

    // On mobile, switch to viewer
    if (isMobile) {
      setActiveView("viewer");
    }

    // Fetch the full content
    try {
      // Find selected mailbox to determine accountId (for shared folders)
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      // Only pass accountId for shared mailboxes
      const accountId = mailbox?.isShared ? mailbox.accountId : undefined;

      const fullEmail = await client.getEmail(email.id, accountId);
      if (fullEmail) {
        selectEmail(fullEmail);
        if (isTablet) setTabletListVisible(false);
      }
    } catch {
      return;
    } finally {
      setLoadingEmail(false);
    }
  };

  // Handle back navigation from viewer on mobile
  const handleMobileBack = () => {
    // If in conversation view, clear it
    if (conversationThread) {
      setConversationThread(null);
      setConversationEmails([]);
    }
    selectEmail(null);
    setActiveView("list");
  };

  // Handle opening conversation view on mobile
  const handleOpenConversation = async (thread: ThreadGroup) => {
    if (!client) return;

    setConversationThread(thread);
    setIsLoadingConversation(true);
    setActiveView("viewer");

    try {
      // Fetch complete thread emails
      const emails = await client.getThreadEmails(thread.threadId);
      setConversationEmails(emails);
    } catch {
      // Fall back to thread.emails
      setConversationEmails(thread.emails);
    } finally {
      setIsLoadingConversation(false);
    }
  };

  // Handle reply from conversation view
  const handleConversationReply = (email: Email) => {
    selectEmail(email);
    setComposerMode('reply');
    setShowComposer(true);
  };

  const handleConversationReplyAll = (email: Email) => {
    selectEmail(email);
    setComposerMode('replyAll');
    setShowComposer(true);
  };

  const handleConversationForward = (email: Email) => {
    selectEmail(email);
    setComposerMode('forward');
    setShowComposer(true);
  };

  return (
    <DragDropProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Desktop Navigation Rail */}
        {!isMobile && !isTablet && (
          <div className="w-14 border-r border-border bg-secondary flex flex-col items-center flex-shrink-0">
            <NavigationRail collapsed />
          </div>
        )}

        {/* Mobile/Tablet Sidebar Overlay Backdrop */}
        {(isMobile || isTablet) && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - overlay on mobile/tablet, fixed on desktop */}
        <div
          className={cn(
            "flex-shrink-0 h-full z-50",
            // Mobile/Tablet: fixed overlay
            "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-72",
            "max-lg:transform max-lg:transition-transform max-lg:duration-300 max-lg:ease-in-out",
            !sidebarOpen && "max-lg:-translate-x-full",
            // Desktop: normal flow
            "lg:relative lg:translate-x-0"
          )}
        >
          <ErrorBoundary fallback={SidebarErrorFallback}>
            <Sidebar
              mailboxes={mailboxes}
              selectedMailbox={selectedMailbox}
              onMailboxSelect={handleMailboxSelect}
              onCompose={() => {
                setComposerMode('compose');
                setShowComposer(true);
                if (isMobile) setSidebarOpen(false);
              }}
              onLogout={handleLogout}
              onSidebarClose={() => setSidebarOpen(false)}
              onSearch={handleSearch}
              onClearSearch={handleClearSearch}
              activeSearchQuery={searchQuery}
              quota={quota}
              isPushConnected={isPushConnected}
            />
          </ErrorBoundary>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          <div className="flex flex-1 min-h-0">
          {/* Email List - full width on mobile, fixed width on tablet/desktop */}
          <div
            className={cn(
              "flex flex-col h-full bg-background border-r border-border",
              // Mobile: full width, hidden when viewing email
              "max-md:flex-1 max-md:border-r-0",
              activeView !== "list" && "max-md:hidden",
              // Tablet: full width when no email, fixed width when viewing
              !selectedEmail ? "md:flex-1 md:border-r-0" : "md:w-80 lg:w-96 md:flex-shrink-0",
              "md:shadow-sm",
              // Collapse list when viewing email on tablet (tabletListVisible only toggled in tablet range)
              selectedEmail && !tabletListVisible && "md:w-0 md:opacity-0 md:overflow-hidden md:border-r-0"
            )}
          >
            {/* Mobile Header for List View */}
            <MobileHeader
              title={currentMailboxName}
              onCompose={() => {
                setComposerMode('compose');
                setShowComposer(true);
              }}
            />

            <AdvancedSearchPanel
              filters={searchFilters}
              isOpen={isAdvancedSearchOpen}
              onFiltersChange={setSearchFilters}
              onClear={() => {
                clearSearchFilters();
                if (client) advancedSearch(client);
              }}
              onSearch={handleAdvancedSearch}
              onClose={toggleAdvancedSearch}
            />

            <WelcomeBanner />

            <ErrorBoundary fallback={EmailListErrorFallback}>
              <EmailList
                emails={emails}
                selectedEmailId={selectedEmail?.id}
                isLoading={isLoading}
                onEmailSelect={handleEmailSelect}
                onOpenConversation={handleOpenConversation}
                // Context menu handlers
                onReply={(email) => {
                  selectEmail(email);
                  handleReply();
                }}
                onReplyAll={(email) => {
                  selectEmail(email);
                  handleReplyAll();
                }}
                onForward={(email) => {
                  selectEmail(email);
                  handleForward();
                }}
                onMarkAsRead={async (email, read) => {
                  if (client) {
                    await markAsRead(client, email.id, read);
                  }
                }}
                onToggleStar={async (email) => {
                  if (client) {
                    await toggleStar(client, email.id);
                  }
                }}
                onDelete={async (email) => {
                  selectEmail(email);
                  await handleDelete();
                }}
                onArchive={async (email) => {
                  selectEmail(email);
                  await handleArchive();
                }}
                onSetColorTag={(emailId, color) => {
                  handleSetColorTag(emailId, color);
                }}
                onMoveToMailbox={async (emailId, mailboxId) => {
                  if (client) {
                    await moveToMailbox(client, emailId, mailboxId);
                  }
                }}
                onMarkAsSpam={async (email) => {
                  selectEmail(email);
                  await handleMarkAsSpam();
                }}
                onUndoSpam={async (email) => {
                  selectEmail(email);
                  await handleUndoSpam();
                }}
                className="flex-1"
              />
            </ErrorBoundary>
          </div>

          {/* Email Viewer - full screen on mobile, flex on tablet/desktop */}
          <div
            className={cn(
              "flex flex-col h-full bg-background",
              // Mobile: full screen overlay when active
              "max-md:fixed max-md:inset-0 max-md:z-30",
              activeView !== "viewer" && "max-md:hidden",
              // Tablet/Desktop: flex grow
              "md:flex-1 md:min-w-0 md:relative",
              // Hide viewer when no email selected (list takes full width)
              !selectedEmail && "max-lg:hidden"
            )}
          >
            {/* Mobile Conversation View - shown when thread is selected on mobile */}
            {isMobile && conversationThread ? (
              <ThreadConversationView
                thread={conversationThread}
                emails={conversationEmails}
                isLoading={isLoadingConversation}
                onBack={handleMobileBack}
                onReply={handleConversationReply}
                onReplyAll={handleConversationReplyAll}
                onForward={handleConversationForward}
                onDownloadAttachment={handleDownloadAttachment}
                onMarkAsRead={async (emailId, read) => {
                  if (client) {
                    await markAsRead(client, emailId, read);
                  }
                }}
              />
            ) : (
              <>
                {/* Mobile Header for Viewer */}
                {isMobile && activeView === "viewer" && (
                  <MobileViewerHeader
                    subject={selectedEmail?.subject}
                    onBack={handleMobileBack}
                  />
                )}

                <ErrorBoundary fallback={EmailViewerErrorFallback}>
                  <EmailViewer
                    email={selectedEmail}
                    isLoading={isLoadingEmail}
                    onReply={handleReply}
                    onReplyAll={handleReplyAll}
                    onForward={handleForward}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                    onToggleStar={handleToggleStar}
                    onSetColorTag={handleSetColorTag}
                    onMarkAsSpam={handleMarkAsSpam}
                    onUndoSpam={handleUndoSpam}
                    onMarkAsRead={async (emailId, read) => {
                      if (client) {
                        await markAsRead(client, emailId, read);
                      }
                    }}
                    onDownloadAttachment={handleDownloadAttachment}
                    onQuickReply={handleQuickReply}
                    onBack={() => {
                      setTabletListVisible(true);
                      selectEmail(null);
                    }}
                    onShowShortcuts={() => setShowShortcutsModal(true)}
                    onSearchSender={(email) => {
                      const query = `from:${email}`;
                      setSearchQuery(query);
                      if (client) {
                        searchEmails(client, query);
                      }
                    }}
                    onAddContact={(name, email) => {
                      if (client && contactStore.supportsSync) {
                        contactStore.createContact(client, {
                          kind: 'individual',
                          name: name ? { components: [{ kind: 'given', value: name }], isOrdered: true } : undefined,
                          emails: { email0: { address: email } },
                        });
                      } else {
                        contactStore.addLocalContact({
                          id: `local-${crypto.randomUUID()}`,
                          addressBookIds: {},
                          kind: 'individual',
                          name: name ? { components: [{ kind: 'given', value: name }], isOrdered: true } : undefined,
                          emails: { email0: { address: email } },
                        });
                      }
                    }}
                    currentUserEmail={client?.["username"]}
                    currentUserName={client?.["username"]?.split("@")[0]}
                    currentMailboxRole={mailboxes.find(m => m.id === selectedMailbox)?.role}
                    className={isMobile ? "flex-1" : undefined}
                  />
                </ErrorBoundary>
              </>
            )}
          </div>
          </div>

          {/* Mobile/Tablet Bottom Navigation */}
          {(isMobile || isTablet) && (
            <NavigationRail orientation="horizontal" />
          )}
        </div>

        {/* Email Composer Modal */}
        {showComposer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 lg:p-0">
            <div className={cn(
              "w-full h-full lg:h-[600px] lg:max-w-3xl",
              "max-lg:flex max-lg:flex-col"
            )}>
              <ErrorBoundary
                fallback={ComposerErrorFallback}
                onReset={() => {
                  setShowComposer(false);
                  setComposerMode('compose');
                }}
              >
                <EmailComposer
                  mode={composerMode}
                  replyTo={selectedEmail ? {
                    from: selectedEmail.from,
                    to: selectedEmail.to,
                    cc: selectedEmail.cc,
                    subject: selectedEmail.subject,
                    body: selectedEmail.bodyValues?.[selectedEmail.textBody?.[0]?.partId || '']?.value || selectedEmail.preview || '',
                    receivedAt: selectedEmail.receivedAt
                  } : undefined}
                  initialDraftText={composerDraftText}
                  onSend={handleEmailSend}
                  onClose={() => {
                    setShowComposer(false);
                    setComposerMode('compose');
                    setComposerDraftText("");
                  }}
                  onDiscardDraft={handleDiscardDraft}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Modal */}
        <KeyboardShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />

        {/* Screen reader live region for dynamic status announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true" id="sr-status" />
      </div>
    </DragDropProvider>
  );
}
