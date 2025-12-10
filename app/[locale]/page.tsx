"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { useUIStore } from "@/stores/ui-store";
import { useDeviceDetection } from "@/hooks/use-media-query";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { debug } from "@/lib/debug";
import { cn } from "@/lib/utils";
import {
  ErrorBoundary,
  SidebarErrorFallback,
  EmailListErrorFallback,
  EmailViewerErrorFallback,
  ComposerErrorFallback,
} from "@/components/error";
import { DragDropProvider } from "@/contexts/drag-drop-context";

export default function Home() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations();
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<'compose' | 'reply' | 'replyAll' | 'forward'>('compose');
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  // Mobile conversation view state
  const [conversationThread, setConversationThread] = useState<ThreadGroup | null>(null);
  const [conversationEmails, setConversationEmails] = useState<Email[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const markAsReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { isAuthenticated, client, logout, checkAuth, isLoading: authLoading } = useAuthStore();

  // Mobile responsive hooks
  const { isMobile } = useDeviceDetection();
  const { activeView, sidebarOpen, setSidebarOpen, setActiveView } = useUIStore();
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
    isLoading,
    isLoadingEmail,
    setLoadingEmail,
    setPushConnected,
    handleStateChange,
    clearNewEmailNotification,
  } = useEmailStore();

  // Play notification sound for new emails
  const playNotificationSound = () => {
    try {
      // Use Web Audio API for a simple notification beep
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Hz
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1; // Low volume

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15); // Short beep
    } catch (e) {
      debug.log('Could not play notification sound:', e);
    }
  };

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
      selectEmail(null);
      if (isMobile) {
        setActiveView("list");
      }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [emails, selectedEmail, client, selectedMailbox, isMobile]);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    enabled: isAuthenticated && !showComposer,
    emails,
    selectedEmailId: selectedEmail?.id,
    handlers: keyboardHandlers,
  });

  // Update page title based on context
  useEffect(() => {
    let title = "Webmail";

    if (showComposer) {
      // Composing email
      const modeText = {
        compose: t('email_composer.new_message'),
        reply: t('email_composer.reply'),
        replyAll: t('email_composer.reply_all'),
        forward: t('email_composer.forward'),
      }[composerMode] || t('email_composer.new_message');
      title = `${modeText} - Webmail`;
    } else if (selectedEmail) {
      // Reading email
      const subject = selectedEmail.subject || t('email_viewer.no_subject');
      title = `${subject} - Webmail`;
    } else if (selectedMailbox && mailboxes.length > 0) {
      // Mailbox view
      const mailbox = mailboxes.find(mb => mb.id === selectedMailbox);
      if (mailbox) {
        const mailboxName = mailbox.name;
        const unreadCount = mailbox.unreadEmails || 0;
        title = unreadCount > 0
          ? `${mailboxName} (${unreadCount}) - Webmail`
          : `${mailboxName} - Webmail`;
      }
    }

    document.title = title;
  }, [showComposer, composerMode, selectedEmail, selectedMailbox, mailboxes, t]);

  // Check auth on mount
  useEffect(() => {
    checkAuth().finally(() => {
      setInitialCheckDone(true);
    });
  }, [checkAuth]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (initialCheckDone && !isAuthenticated && !authLoading) {
      router.push(`/${params.locale}/login`);
    }
  }, [initialCheckDone, isAuthenticated, authLoading, router, params.locale]);

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
        } catch (error) {
          console.error('Error loading email data:', error);
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
  }, [isAuthenticated, client, mailboxes.length, fetchMailboxes, fetchEmails, fetchQuota, handleStateChange, setPushConnected]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmail?.id]);

  // Handle new email notifications - play sound
  useEffect(() => {
    if (newEmailNotification) {
      playNotificationSound();
      debug.log('New email received:', newEmailNotification.subject);
      clearNewEmailNotification();
    }
  }, [newEmailNotification, clearNewEmailNotification]);

  const handleEmailSend = async (data: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    draftId?: string;
  }) => {
    if (!client) return;

    try {
      await sendEmail(client, data.to, data.subject, data.body, data.cc, data.bcc, data.draftId);
      setShowComposer(false);
    } catch (error) {
      console.error("Failed to send email:", error);
    }
  };

  const handleDiscardDraft = async (draftId: string) => {
    if (!client) return;

    try {
      await client.deleteEmail(draftId);
    } catch (error) {
      console.error("Failed to discard draft:", error);
    }
  };

  const handleReply = () => {
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

  const handleDelete = async () => {
    if (!client || !selectedEmail) return;

    try {
      await deleteEmail(client, selectedEmail.id);
      selectEmail(null);
    } catch (error) {
      console.error("Failed to delete email:", error);
    }
  };

  const handleArchive = async () => {
    if (!client || !selectedEmail) return;

    // Find archive mailbox
    const archiveMailbox = mailboxes.find(m => m.role === "archive" || m.name.toLowerCase() === "archive");
    if (archiveMailbox) {
      try {
        await moveToMailbox(client, selectedEmail.id, archiveMailbox.id);
        selectEmail(null);
      } catch (error) {
        console.error("Failed to archive email:", error);
      }
    }
  };

  const handleToggleStar = async () => {
    if (!client || !selectedEmail) return;

    try {
      await toggleStar(client, selectedEmail.id);
    } catch (error) {
      console.error("Failed to toggle star:", error);
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

      // Refresh emails list to show color in list
      await fetchEmails(client, selectedMailbox);
    } catch (error) {
      console.error("Failed to set color tag:", error);
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

    if (client) {
      await fetchEmails(client, mailboxId);
    }
  };

  const handleLogout = () => {
    logout();
    router.push(`/${params.locale}/login`);
  };

  const handleSearch = async (query: string) => {
    if (!client) return;
    await searchEmails(client, query);
  };

  const handleDownloadAttachment = async (blobId: string, name: string, type?: string) => {
    if (!client) return;

    try {
      await client.downloadBlob(blobId, name, type);
    } catch (error) {
      console.error("Failed to download attachment:", error);
    }
  };

  const handleQuickReply = async (body: string) => {
    if (!client || !selectedEmail) return;

    const sender = selectedEmail.from?.[0];
    if (!sender?.email) {
      throw new Error("No sender email found");
    }

    // Send reply with just the body text
    await sendEmail(
      client,
      [sender.email],
      `Re: ${selectedEmail.subject || "(no subject)"}`,
      body
    );

    // Refresh emails to show the sent reply
    await fetchEmails(client, selectedMailbox);
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
        // Mark-as-read logic is now handled by useEffect
      }
    } catch (error) {
      console.error('Failed to fetch email content:', error);
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
    } catch (error) {
      console.error('Failed to fetch thread emails:', error);
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
        {/* Mobile Sidebar Overlay Backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - overlay on mobile, fixed on desktop */}
        <div
          className={cn(
            "flex-shrink-0 h-full z-50",
            // Mobile: fixed overlay
            "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-72",
            "max-md:transform max-md:transition-transform max-md:duration-300 max-md:ease-in-out",
            isMobile && !sidebarOpen && "max-md:-translate-x-full",
            // Desktop: normal flow
            "md:relative md:translate-x-0"
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
              onSearch={handleSearch}
              quota={quota}
              isPushConnected={isPushConnected}
            />
          </ErrorBoundary>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 min-w-0 h-full">
          {/* Email List - full width on mobile, fixed width on desktop */}
          <div
            className={cn(
              "flex flex-col h-full bg-background border-r border-border",
              // Mobile: full width, hidden when viewing email
              "max-md:flex-1 max-md:border-r-0",
              isMobile && activeView !== "list" && "max-md:hidden",
              // Desktop: fixed width
              "md:w-80 lg:w-96 md:flex-shrink-0 md:shadow-sm"
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
                className="flex-1"
              />
            </ErrorBoundary>
          </div>

          {/* Email Viewer - full screen on mobile, flex on desktop */}
          <div
            className={cn(
              "flex flex-col h-full bg-background",
              // Mobile: full screen overlay when active
              "max-md:fixed max-md:inset-0 max-md:z-30",
              isMobile && activeView !== "viewer" && "max-md:hidden",
              // Desktop: flex grow
              "md:flex-1 md:relative"
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
                    onMarkAsRead={async (emailId, read) => {
                      if (client) {
                        await markAsRead(client, emailId, read);
                      }
                    }}
                    onDownloadAttachment={handleDownloadAttachment}
                    onQuickReply={handleQuickReply}
                    currentUserEmail={client?.["username"]}
                    currentUserName={client?.["username"]?.split("@")[0]}
                    className={isMobile ? "flex-1" : undefined}
                  />
                </ErrorBoundary>
              </>
            )}
          </div>
        </div>

        {/* Email Composer Modal */}
        {showComposer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 md:p-0">
            <div className={cn(
              "w-full h-full md:h-auto md:max-w-3xl md:max-h-[600px]",
              "max-md:flex max-md:flex-col"
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
                  onSend={handleEmailSend}
                  onClose={() => {
                    setShowComposer(false);
                    setComposerMode('compose');
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
      </div>
    </DragDropProvider>
  );
}
