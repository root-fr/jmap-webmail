"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DOMPurify from "dompurify";
import { Email } from "@/lib/jmap/types";
import { hasRichFormatting, needsIframeRendering, buildEmailSanitizeConfig, collapseBlockedImageContainers, plainTextToSafeHtml } from "@/lib/email-sanitization";
import { SandboxedEmailFrame } from "./sandboxed-email-frame";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { formatFileSize, cn } from "@/lib/utils";
import { getSecurityStatus, extractListHeaders } from "@/lib/email-headers";
import {
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  Star,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Download,
  Paperclip,
  Mail,
  Clock,
  Loader2,
  Printer,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  File,
  Shield,
  Image,
  Circle,
  X,
  Check,
  AlertTriangle,
  Minus,
  ShieldCheck,
  ShieldAlert,
  Network,
  Hash,
  List,
  Code,
  Copy,
  Brain,
  Sparkles,
  Keyboard,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { useDeviceDetection } from "@/hooks/use-media-query";
import { useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";
import { transformInlineStyles, transformColorForDarkMode, transformBgColorForDarkMode } from "@/lib/color-transform";
import { EmailIdentityBadge } from "./email-identity-badge";
import { MobileActionBar } from "./mobile-action-bar";
import { UnsubscribeBanner } from "./unsubscribe-banner";
import { CalendarInvitationBanner } from "./calendar-invitation-banner";
import { findCalendarAttachment } from "@/lib/calendar-invitation";
import { SenderInfoPanel } from "./sender-info-panel";

interface EmailViewerProps {
  email: Email | null;
  isLoading?: boolean;
  onReply?: (draftText?: string) => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onToggleStar?: () => void;
  onMarkAsRead?: (emailId: string, read: boolean) => void;
  onSetColorTag?: (emailId: string, color: string | null) => void;
  onDownloadAttachment?: (blobId: string, name: string, type?: string) => void;
  onQuickReply?: (body: string) => Promise<void>;
  onMarkAsSpam?: () => void;
  onUndoSpam?: () => void;
  onBack?: () => void;
  onShowShortcuts?: () => void;
  onSearchSender?: (email: string) => void;
  onAddContact?: (name: string, email: string) => void;
  currentUserEmail?: string;
  currentUserName?: string;
  currentMailboxRole?: string;
  className?: string;
}

// Helper function to get file icon based on mime type or extension
const getFileIcon = (name?: string, type?: string) => {
  const ext = name?.split('.').pop()?.toLowerCase();
  const mimeType = type?.toLowerCase();

  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) {
    return FileImage;
  }
  if (mimeType?.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv'].includes(ext || '')) {
    return FileVideo;
  }
  if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac'].includes(ext || '')) {
    return FileAudio;
  }
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return FileText;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return FileArchive;
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '')) {
    return FileText;
  }
  return File;
};

const getCurrentColor = (keywords: Record<string, boolean> | undefined) => {
  if (!keywords) return null;
  for (const key of Object.keys(keywords)) {
    if (key.startsWith("$color:") && keywords[key] === true) {
      return key.replace("$color:", "");
    }
  }
  return null;
};

// Helper function to format recipients with contextual display
const formatRecipients = (
  recipients: Array<{ name?: string; email: string }> | undefined,
  currentUserEmail: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): string => {
  if (!recipients || recipients.length === 0) return '';

  // Check if the first recipient is the current user
  const firstRecipient = recipients[0];
  const isFirstRecipientMe = currentUserEmail &&
    (firstRecipient.email.toLowerCase() === currentUserEmail.toLowerCase() ||
     firstRecipient.email.toLowerCase().startsWith(currentUserEmail.toLowerCase().split('@')[0] + '+'));

  // If only one recipient and it's the current user, show "me"
  if (recipients.length === 1 && isFirstRecipientMe) {
    return t('recipient_me');
  }

  // Format up to 2 recipients by name (or email if no name)
  const displayRecipients = recipients.slice(0, 2).map((r, index) => {
    if (index === 0 && isFirstRecipientMe) {
      return t('recipient_me');
    }
    return r.name || r.email;
  });

  // If more than 2 recipients, add count
  if (recipients.length > 2) {
    const displayName = displayRecipients[0];
    return t('recipient_and_others', { name: displayName, count: recipients.length - 1 });
  }

  return displayRecipients.join(', ');
};

export function EmailViewer({
  email,
  isLoading = false,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onArchive,
  onToggleStar,
  onMarkAsRead,
  onSetColorTag,
  onDownloadAttachment,
  onQuickReply,
  onMarkAsSpam,
  onUndoSpam,
  onBack,
  onShowShortcuts,
  onSearchSender,
  onAddContact,
  currentUserEmail,
  currentUserName,
  currentMailboxRole,
  className,
}: EmailViewerProps) {
  const t = useTranslations('email_viewer');
  const tCommon = useTranslations('common');
  const externalContentPolicy = useSettingsStore((state) => state.externalContentPolicy);
  const addTrustedSender = useSettingsStore((state) => state.addTrustedSender);
  const isSenderTrusted = useSettingsStore((state) => state.isSenderTrusted);

  // Detect if current mailbox is Junk folder
  const isInJunkFolder = currentMailboxRole === 'junk';

  // Color options for email tags (using translations)
  const colorOptions = [
    { name: t("color_tag.red"), value: "red", color: "bg-red-500" },
    { name: t("color_tag.orange"), value: "orange", color: "bg-orange-500" },
    { name: t("color_tag.yellow"), value: "yellow", color: "bg-yellow-500" },
    { name: t("color_tag.green"), value: "green", color: "bg-green-500" },
    { name: t("color_tag.blue"), value: "blue", color: "bg-blue-500" },
    { name: t("color_tag.purple"), value: "purple", color: "bg-purple-500" },
    { name: t("color_tag.pink"), value: "pink", color: "bg-pink-500" },
  ];

  // Tablet list visibility
  const { isMobile, isTablet } = useDeviceDetection();
  const { tabletListVisible } = useUIStore();
  const { identities, client } = useAuthStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [showFullHeaders, setShowFullHeaders] = useState(false);
  const [allowExternalContent, setAllowExternalContent] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState("");
  const [isQuickReplyFocused, setIsQuickReplyFocused] = useState(false);
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSenderInfo, setShowSenderInfo] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const currentColor = getCurrentColor(email?.keywords);
  const [dismissedUnsubBanners, setDismissedUnsubBanners] = useState<Set<string>>(
    () => {
      if (typeof window === 'undefined') return new Set();
      const saved = localStorage.getItem('dismissed-unsub-banners');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    }
  );

  // Wire the print overlay at the document level so Ctrl+P / Cmd+P /
  // browser menu triggers go through the same cloning path as the
  // in-app Print button. beforeprint fires right before the dialog
  // opens, afterprint fires whether the user prints or cancels.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforePrint = () => {
      if (document.getElementById("print-overlay")) return;
      const source = document.getElementById("email-viewer-container");
      if (!source) return;

      const clone = source.cloneNode(true) as HTMLElement;

      // Sandboxed email HTML renders inside an <iframe srcDoc=...>. Cloning
      // the iframe creates a fresh browsing context that would reload
      // srcDoc asynchronously, after beforeprint has already completed and
      // the browser has taken its DOM snapshot for printing — the printed
      // page ends up with an empty iframe. Move the already-rendered nodes
      // from the live iframe's body into a plain div on the clone so the
      // print snapshot sees fully-rendered content.
      const liveFrames = source.querySelectorAll<HTMLIFrameElement>("iframe");
      const cloneFrames = clone.querySelectorAll<HTMLIFrameElement>("iframe");
      liveFrames.forEach((live, i) => {
        const cloned = cloneFrames[i];
        if (!cloned) return;
        const doc = live.contentDocument;
        if (!doc?.body) return;
        const replacement = document.createElement("div");
        replacement.className = "email-content print-inlined-iframe";
        // cloneNode on each child node avoids a string round-trip so the
        // sanitized content stays sanitized — no innerHTML on the overlay.
        doc.body.childNodes.forEach((n) => {
          replacement.appendChild(n.cloneNode(true));
        });
        // Copy the iframe body's computed font so the inlined content
        // looks the same in print as it did on screen.
        const bodyStyle = doc.defaultView?.getComputedStyle(doc.body);
        if (bodyStyle) {
          replacement.style.fontFamily = bodyStyle.fontFamily;
          replacement.style.fontSize = bodyStyle.fontSize;
          replacement.style.lineHeight = bodyStyle.lineHeight;
          replacement.style.overflowWrap = "break-word";
        }
        cloned.replaceWith(replacement);
      });

      const overlay = document.createElement("div");
      overlay.id = "print-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.appendChild(clone);
      document.body.appendChild(overlay);
      document.documentElement.classList.add("is-printing");
    };

    const handleAfterPrint = () => {
      document.getElementById("print-overlay")?.remove();
      document.documentElement.classList.remove("is-printing");
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      handleAfterPrint();
    };
  }, []);

  // Gmail tags attachments with a Content-ID even when the body never
  // references them inline, so "has a cid" ≠ "is an inline image". Build
  // a set of the cids actually cited as cid:... URLs in the HTML body;
  // treat anything not in that set as a regular downloadable attachment.
  const referencedCids = useMemo(() => {
    const cids = new Set<string>();
    if (!email?.htmlBody || !email.bodyValues) return cids;
    for (const part of email.htmlBody) {
      const html = part.partId ? email.bodyValues[part.partId]?.value : undefined;
      if (!html) continue;
      const matches = html.matchAll(/cid:([^"'\s>)]+)/gi);
      for (const m of matches) cids.add(m[1]);
    }
    return cids;
  }, [email?.htmlBody, email?.bodyValues]);

  const isInlineAttachment = useCallback(
    (att: { cid?: string; blobId?: string }) =>
      !!(att.cid && att.blobId && referencedCids.has(att.cid)),
    [referencedCids]
  );

  const [cidUrls, setCidUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!email?.attachments || !client) {
      setCidUrls(new Map());
      return;
    }
    const inlineAtts = email.attachments.filter(isInlineAttachment);
    if (inlineAtts.length === 0) {
      setCidUrls(new Map());
      return;
    }
    let cancelled = false;
    const objectUrls: string[] = [];
    Promise.all(
      inlineAtts.map(async (att) => {
        try {
          const objectUrl = await client.fetchBlobAsObjectUrl(att.blobId, att.name, att.type);
          objectUrls.push(objectUrl);
          return [att.cid!, objectUrl] as const;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const r of results) {
        if (r) map.set(r[0], r[1]);
      }
      setCidUrls(map);
    });
    return () => {
      cancelled = true;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [email?.id, email?.attachments, client, isInlineAttachment]);

  // Mark-as-read is driven by the page-level markAsReadDelay setting
  // (app/[locale]/page.tsx). The viewer must not force it on display.

  // Reset external content permission and quick reply when email changes
  // Initialize allowExternalContent based on externalContentPolicy setting
  useEffect(() => {
    // 'allow' = always allow, 'block' = always block, 'ask' = user decides per email
    setAllowExternalContent(externalContentPolicy === 'allow');
    setQuickReplyText("");
    setIsQuickReplyFocused(false);
    setShowSourceModal(false);
    setShowSenderInfo(false);
    setShowMoreActions(false);
  }, [email?.id, externalContentPolicy]);

  // Generate email source for viewing
  const generateEmailSource = (email: Email): string => {
    let source = '';

    // Headers
    source += '=== EMAIL HEADERS ===\n\n';
    if (email.messageId) source += `Message-ID: ${email.messageId}\n`;
    if (email.from) source += `From: ${email.from.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')}\n`;
    if (email.to) source += `To: ${email.to.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')}\n`;
    if (email.cc) source += `Cc: ${email.cc.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')}\n`;
    if (email.bcc) source += `Bcc: ${email.bcc.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')}\n`;
    if (email.replyTo) source += `Reply-To: ${email.replyTo.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')}\n`;
    if (email.subject) source += `Subject: ${email.subject}\n`;
    if (email.sentAt) source += `Date: ${new Date(email.sentAt).toUTCString()}\n`;
    if (email.receivedAt) source += `Received-At: ${new Date(email.receivedAt).toUTCString()}\n`;
    if (email.inReplyTo) source += `In-Reply-To: ${email.inReplyTo.join(', ')}\n`;
    if (email.references) source += `References: ${email.references.join(', ')}\n`;

    // Additional headers
    if (email.headers) {
      source += '\n--- Additional Headers ---\n';
      // Headers should now always be a Record after client processing
      Object.entries(email.headers).forEach(([key, value]) => {
        const val = Array.isArray(value) ? value.join('\n    ') : String(value);
        source += `${key}: ${val}\n`;
      });
    }

    // Authentication results
    if (email.authenticationResults) {
      source += '\n--- Authentication Results ---\n';
      if (email.authenticationResults.spf) {
        source += `SPF: ${email.authenticationResults.spf.result}`;
        if (email.authenticationResults.spf.domain) source += ` (${email.authenticationResults.spf.domain})`;
        source += '\n';
      }
      if (email.authenticationResults.dkim) {
        source += `DKIM: ${email.authenticationResults.dkim.result}`;
        if (email.authenticationResults.dkim.domain) source += ` (${email.authenticationResults.dkim.domain})`;
        source += '\n';
      }
      if (email.authenticationResults.dmarc) {
        source += `DMARC: ${email.authenticationResults.dmarc.result}`;
        if (email.authenticationResults.dmarc.policy) source += ` policy=${email.authenticationResults.dmarc.policy}`;
        source += '\n';
      }
    }

    if (email.spamScore !== undefined) {
      source += `Spam Score: ${email.spamScore}`;
      if (email.spamStatus) source += ` (${email.spamStatus})`;
      source += '\n';
    }

    // Metadata
    source += '\n=== EMAIL METADATA ===\n\n';
    source += `Email ID: ${email.id}\n`;
    source += `Thread ID: ${email.threadId}\n`;
    source += `Size: ${formatFileSize(email.size)}\n`;
    source += `Has Attachment: ${email.hasAttachment ? 'Yes' : 'No'}\n`;
    if (email.keywords) {
      const keywords = Object.entries(email.keywords)
        .filter(([_, v]) => v)
        .map(([k]) => k)
        .join(', ');
      if (keywords) source += `Keywords: ${keywords}\n`;
    }

    // Attachments
    if (email.attachments && email.attachments.length > 0) {
      source += '\n=== ATTACHMENTS ===\n\n';
      email.attachments.forEach((att, i) => {
        source += `[${i + 1}] ${att.name || 'Unnamed'}\n`;
        source += `    Type: ${att.type}\n`;
        source += `    Size: ${formatFileSize(att.size)}\n`;
        source += `    Blob ID: ${att.blobId}\n`;
        if (att.cid) source += `    Content-ID: ${att.cid}\n`;
        source += '\n';
      });
    }

    // Body content
    source += '\n=== EMAIL BODY ===\n\n';

    let hasBodyContent = false;

    // Text version
    if (email.textBody?.[0]?.partId && email.bodyValues?.[email.textBody[0].partId]) {
      const textValue = email.bodyValues[email.textBody[0].partId].value;
      if (textValue && textValue.trim()) {
        source += '--- Plain Text Version ---\n\n';
        source += textValue;
        source += '\n\n';
        hasBodyContent = true;
      }
    }

    // HTML version
    if (email.htmlBody?.[0]?.partId && email.bodyValues?.[email.htmlBody[0].partId]) {
      const htmlValue = email.bodyValues[email.htmlBody[0].partId].value;
      if (htmlValue && htmlValue.trim()) {
        source += '--- HTML Version ---\n\n';
        source += htmlValue;
        source += '\n\n';
        hasBodyContent = true;
      }
    }

    // All body values if we haven't found content yet
    if (!hasBodyContent && email.bodyValues) {
      const bodyKeys = Object.keys(email.bodyValues);
      if (bodyKeys.length > 0) {
        source += '--- Body Parts ---\n\n';
        bodyKeys.forEach((key, index) => {
          const bodyValue = email.bodyValues![key].value;
          if (bodyValue && bodyValue.trim()) {
            source += `Part ${index + 1} (${key}):\n`;
            source += bodyValue;
            source += '\n\n';
            hasBodyContent = true;
          }
        });
      }
    }

    // Preview if no body
    if (!hasBodyContent && email.preview) {
      source += '--- Preview Only ---\n\n';
      source += email.preview;
      source += '\n';
    }

    if (!hasBodyContent && !email.preview) {
      source += '(No body content available)\n';
    }

    return source;
  };

  const [sourceCopied, setSourceCopied] = useState(false);
  const copySourceToClipboard = async () => {
    if (!email) return;

    try {
      const source = generateEmailSource(email);
      await navigator.clipboard.writeText(source);
      setSourceCopied(true);
      setTimeout(() => setSourceCopied(false), 2000);
    } catch {
      return;
    }
  };

  // Sanitize and prepare email HTML content
  const emailContent = useMemo(() => {
    if (!email) return { html: "", isHtml: false, hasBlockedContent: false };

    // Check if we have body values
    if (email.bodyValues) {
      // Check if HTML content exists and if it's actually rich HTML or just plain text wrapper
      let useHtmlVersion = false;
      let htmlContent = '';

      if (email.htmlBody?.[0]?.partId && email.bodyValues[email.htmlBody[0].partId]) {
        htmlContent = email.bodyValues[email.htmlBody[0].partId].value;

        // Use safe parsing instead of innerHTML to detect rich formatting
        useHtmlVersion = hasRichFormatting(htmlContent);
      }

      // If we should use HTML version and it exists
      if (useHtmlVersion && htmlContent) {
        // Create a custom DOMPurify hook to handle external content
        let blockedExternalContent = false;

        // Check if sender is trusted
        const senderEmail = email.from?.[0]?.email?.toLowerCase();
        const senderIsTrusted = senderEmail ? isSenderTrusted(senderEmail) : false;

        // Block external content based on policy:
        // 'allow' = never block, 'block' = always block (unless trusted), 'ask' = block until user allows or trusted
        const shouldBlockExternal = !senderIsTrusted && (
          externalContentPolicy === 'block' ||
          (externalContentPolicy === 'ask' && !allowExternalContent)
        );

        // Fresh per-render config so blocking external content never mutates
        // the shared module arrays.
        const sanitizeConfig = buildEmailSanitizeConfig(shouldBlockExternal);

        DOMPurify.addHook('afterSanitizeAttributes', (node) => {
          const htmlNode = node as HTMLElement;

          if (shouldBlockExternal) {
            if (node.tagName === 'IMG') {
              const src = node.getAttribute('src');
              if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
                node.setAttribute('data-blocked-src', src);
                node.setAttribute('src', 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJ0cmFuc3BhcmVudCIvPgo8L3N2Zz4=');
                node.setAttribute('alt', '');
                htmlNode.style.display = 'none';
                blockedExternalContent = true;
              }
            }

            if (htmlNode.style) {
              const style = htmlNode.style.cssText;
              if (style && style.includes('url(')) {
                const urlMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/gi);
                if (urlMatch) {
                  htmlNode.style.cssText = style.replace(/url\(['"]?https?:\/\/[^'")\s]+['"]?\)/gi, 'url()');
                  blockedExternalContent = true;
                }
              }
            }
          }

          if (node.tagName === 'A') {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
          }

          if (resolvedTheme === 'dark') {
            if (htmlNode.style) {
              const originalStyles = htmlNode.style.cssText;
              const transformedStyles = transformInlineStyles(originalStyles, 'dark');
              if (transformedStyles !== originalStyles) {
                htmlNode.style.cssText = transformedStyles;
              }
            }

            const colorAttr = node.getAttribute('color');
            if (colorAttr) {
              node.setAttribute('color', transformColorForDarkMode(colorAttr));
            }

            const bgcolorAttr = node.getAttribute('bgcolor');
            if (bgcolorAttr) {
              node.setAttribute('bgcolor', transformBgColorForDarkMode(bgcolorAttr));
            }
          }
        });

        // Sanitize HTML to prevent XSS
        let cleanHtml = DOMPurify.sanitize(htmlContent, sanitizeConfig);

        // Remove the hook after sanitization
        DOMPurify.removeAllHooks();

        // Collapse empty containers left behind by blocked images
        if (shouldBlockExternal && blockedExternalContent) {
          cleanHtml = collapseBlockedImageContainers(cleanHtml);
        }

        // Replace cid: references with pre-fetched object URLs
        if (cidUrls.size > 0) {
          cleanHtml = cleanHtml.replace(/src="cid:([^"]+)"/gi, (match, cid) => {
            const url = cidUrls.get(cid);
            return url ? `src="${url}"` : match;
          });
        }

        return {
          html: cleanHtml,
          isHtml: true,
          useIframe: needsIframeRendering(htmlContent),
          hasBlockedContent: blockedExternalContent,
        };
      }

      // Use text content if available (either as fallback or when HTML is minimal)
      if (email.textBody?.[0]?.partId && email.bodyValues[email.textBody[0].partId]) {
        const textContent = email.bodyValues[email.textBody[0].partId].value;

        return {
          html: plainTextToSafeHtml(textContent),
          isHtml: false,
          hasBlockedContent: false,
        };
      }
    }

    // If no body content is available, show the preview or a message
    if (email.preview) {
      const previewHtml = email.preview
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n/g, '<br>')
        .replace(/\r/g, '<br>')
        .replace(/\n/g, '<br>');

      return {
        html: `<div style="color: var(--color-muted-foreground); font-style: italic;">${previewHtml}</div>`,
        isHtml: false,
        hasBlockedContent: false,
      };
    }

    return {
      html: '<p style="color: var(--color-muted-foreground);">No content available</p>',
      isHtml: false,
      hasBlockedContent: false,
    };
  }, [email, allowExternalContent, externalContentPolicy, isSenderTrusted, resolvedTheme, cidUrls]);

  const hasBlockedContent = emailContent.hasBlockedContent;

  // Detect List-Unsubscribe header for newsletter banners
  const listHeaders = useMemo(() => {
    if (!email?.headers) return null;
    return extractListHeaders(email.headers);
  }, [email?.headers]);

  const shouldShowUnsubBanner =
    listHeaders?.listUnsubscribe?.preferred &&
    !dismissedUnsubBanners.has(email?.messageId || '');

  const hasCalendarInvitation = email ? !!findCalendarAttachment(email) : false;

  // Show loading skeleton while email is being fetched
  if (isLoading && !email) {
    return (
      <div className={cn("flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-200", className)}>
        {/* Loading Header Skeleton - gentler animation */}
        <div className="bg-background border-b border-border">
          <div className="px-4 lg:px-6 py-3 lg:py-4">
            <div className="flex items-start justify-between gap-2 lg:gap-4">
              <div className="flex-1 min-w-0 space-y-2 lg:space-y-3">
                <div className="h-6 lg:h-8 bg-muted/60 rounded-md w-3/4"></div>
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="h-3 lg:h-4 bg-muted/60 rounded w-24 lg:w-32"></div>
                  <div className="h-3 lg:h-4 bg-muted/60 rounded w-16 lg:w-24"></div>
                </div>
              </div>
              <div className="flex items-center gap-1 lg:gap-2">
                <div className="h-8 w-8 lg:w-20 bg-muted/60 rounded"></div>
                <div className="h-8 w-8 bg-muted/60 rounded hidden lg:block"></div>
              </div>
            </div>
          </div>

          {/* Loading Sender Info Skeleton */}
          <div className="px-4 lg:px-6 pb-3 lg:pb-4">
            <div className="flex items-start gap-3 lg:gap-4">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-muted/60 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted/60 rounded w-48"></div>
                <div className="h-3 bg-muted/60 rounded w-64"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Content Skeleton */}
        <div className="flex-1 overflow-auto bg-muted/20">
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-background rounded-lg shadow-sm border border-border overflow-hidden p-6 space-y-3">
              <div className="h-4 bg-muted/60 rounded w-full"></div>
              <div className="h-4 bg-muted/60 rounded w-5/6"></div>
              <div className="h-4 bg-muted/60 rounded w-4/6"></div>
              <div className="h-4 bg-muted/60 rounded w-full"></div>
              <div className="h-4 bg-muted/60 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-muted/30 to-muted/50", className)}>
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-background shadow-lg flex items-center justify-center">
            <Mail className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">{t('no_conversation_selected')}</h3>
          <p className="text-muted-foreground">{t('no_conversation_description')}</p>
        </div>
      </div>
    );
  }

  const sender = email.from?.[0];
  const isStarred = email.keywords?.$flagged;
  const isImportant = email.keywords?.["$important"];

  return (
    <div
      key={email.id}
      id="email-viewer-container"
      className={cn("flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-300 relative", className)}
    >
      {/* Loading overlay when fetching new email */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-background rounded-lg shadow-lg border border-border p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">{t('loading_email')}</span>
          </div>
        </div>
      )}
      {/* Subject Bar - sticky on mobile/tablet for quick actions */}
      <div className={cn(
        "bg-background border-b border-border",
        "max-lg:sticky max-lg:top-0 max-lg:z-10"
      )}>
        <div className="px-4 lg:px-6 py-3 lg:py-4">
          <div className="flex items-start justify-between gap-2 lg:gap-4">
            {/* Tablet Back Button - show when list is hidden */}
            {isTablet && !tabletListVisible && onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-11 w-11 lg:h-10 lg:w-10 flex-shrink-0 -ml-2 print:hidden"
                aria-label={t('back_to_list')}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg lg:text-2xl font-bold text-foreground tracking-tight truncate pr-2">
                {email.subject || t('no_subject')}
              </h1>
              <div className="flex items-center gap-2 lg:gap-3 mt-1.5 lg:mt-2 text-xs lg:text-sm text-muted-foreground flex-wrap lg:flex-nowrap">
                <span className="flex items-center gap-1 lg:gap-1.5 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  {new Date(email.receivedAt).toLocaleString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                {email.hasAttachment && (
                  <span className="flex items-center gap-1 lg:gap-1.5 whitespace-nowrap">
                    <Paperclip className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                    <span className="hidden lg:inline">{t('attachments')}</span>
                  </span>
                )}
                {isImportant && (
                  <span className="px-1.5 lg:px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium whitespace-nowrap">
                    {t('important')}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0 print:hidden">
              {/* Loading indicator */}
              {isLoading && (
                <div className="mr-2 flex items-center gap-1.5 text-muted-foreground hidden lg:flex">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">{t('loading')}</span>
                </div>
              )}
              {/* Primary Reply Button */}
              <Button
                onClick={() => onReply?.()}
                size="sm"
                className="mr-1 h-10 lg:h-9"
                title={t('tooltips.reply')}
              >
                <Reply className="w-4 h-4" />
                <span className="ml-1.5 hidden lg:inline">Reply</span>
              </Button>

              {/* Reply Options Dropdown - hidden on mobile/tablet */}
              <div className="relative group mr-3 hidden lg:block">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 lg:h-8 lg:w-8 hover:bg-muted"
                  title={t('more_reply_options')}
                >
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </Button>
                <div className="absolute right-0 top-full mt-1 w-40 bg-background rounded-md shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <button
                    onClick={onReplyAll}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <ReplyAll className="w-4 h-4" />
                    Reply all
                  </button>
                  <button
                    onClick={onForward}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <Forward className="w-4 h-4" />
                    Forward
                  </button>
                </div>
              </div>

              <div className="w-px h-5 bg-border hidden lg:block" />

              <Button
                variant="ghost"
                size="icon"
                onClick={onArchive}
                className="h-10 w-10 lg:h-8 lg:w-8 hover:bg-muted hidden lg:flex"
                title={t('tooltips.archive')}
              >
                <Archive className="w-4 h-4 text-muted-foreground" />
              </Button>

              {/* Spam/Not Spam Button - Desktop only, contextual based on folder */}
              {(onMarkAsSpam || onUndoSpam) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={isInJunkFolder ? onUndoSpam : onMarkAsSpam}
                  className={cn(
                    "hidden h-10 w-10 lg:h-8 lg:w-8 lg:flex",
                    isInJunkFolder
                      ? "hover:bg-green-50 dark:hover:bg-green-950/30"
                      : "hover:bg-red-50 dark:hover:bg-red-950/30"
                  )}
                  title={isInJunkFolder ? t('spam.not_spam_title') : t('spam.button_title')}
                >
                  {isInJunkFolder ? (
                    <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-10 w-10 lg:h-8 lg:w-8 hover:bg-muted"
                title={t('tooltips.delete')}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleStar}
                className="h-10 w-10 lg:h-8 lg:w-8 hover:bg-muted hidden lg:flex"
                title={isStarred ? "Unstar" : "Star"}
              >
                <Star className={cn(
                  "w-4 h-4 transition-colors",
                  isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                )} />
              </Button>

              <div className="w-px h-5 bg-border mx-1 hidden lg:block" />

              {/* Compact Dynamic Color Picker - hidden on mobile/tablet */}
              <div className="relative group hidden lg:block">
                <button
                  className="h-8 w-8 rounded hover:bg-muted flex items-center justify-center"
                  title={t('set_color')}
                >
                  <Circle className={cn(
                    "w-4 h-4",
                    currentColor === 'red' && "fill-red-500 text-red-500",
                    currentColor === 'orange' && "fill-orange-500 text-orange-500",
                    currentColor === 'yellow' && "fill-yellow-500 text-yellow-500",
                    currentColor === 'green' && "fill-green-500 text-green-500",
                    currentColor === 'blue' && "fill-blue-500 text-blue-500",
                    currentColor === 'purple' && "fill-purple-500 text-purple-500",
                    currentColor === 'pink' && "fill-pink-500 text-pink-500",
                    !currentColor && "text-gray-400"
                  )} />
                </button>

                {/* Colors appear on hover */}
                <div className="absolute right-0 top-full mt-1 p-1.5 bg-background rounded-lg shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <div className="flex gap-1">
                    {colorOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          if (email) {
                            onSetColorTag?.(email.id, option.value);
                          }
                        }}
                        className={cn(
                          "w-6 h-6 rounded-full hover:scale-110 transition-transform",
                          option.color,
                          currentColor === option.value && "ring-2 ring-offset-1 ring-gray-400"
                        )}
                        title={option.name}
                      />
                    ))}
                    {currentColor && (
                      <div className="w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />
                    )}
                    {currentColor && (
                      <button
                        onClick={() => {
                          if (email) {
                            onSetColorTag?.(email.id, null);
                          }
                        }}
                        className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 hover:bg-muted flex items-center justify-center"
                        title={t('remove_color')}
                      >
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* More Actions Dropdown */}
              <div className="relative print:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 lg:h-8 lg:w-8 hover:bg-muted"
                  title={t('more_actions')}
                  onClick={() => setShowMoreActions(prev => !prev)}
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </Button>
                {showMoreActions && (
                  <>
                    <div className="fixed inset-0 z-[9]" onClick={() => setShowMoreActions(false)} onKeyDown={(e) => e.key === 'Escape' && setShowMoreActions(false)} role="presentation" />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-background rounded-md shadow-lg border border-border z-10" role="menu">
                  <button
                    onClick={() => { setShowSourceModal(true); setShowMoreActions(false); }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <Code className="w-4 h-4" />
                    {t('view_source')}
                  </button>
                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      // The overlay is created by the beforeprint listener
                      // above, which also handles Ctrl+P and browser menu
                      // Print triggers.
                      window.print();
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    {t('print')}
                  </button>
                  {onShowShortcuts && (
                    <button
                      onClick={() => { onShowShortcuts(); setShowMoreActions(false); }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                    >
                      <Keyboard className="w-4 h-4" />
                      {t('keyboard_shortcuts')}
                    </button>
                  )}
                  {/* Separator */}
                  <div className="h-px bg-border my-1" />
                  {/* Spam action - contextual */}
                  {(onMarkAsSpam || onUndoSpam) && (
                    <button
                      onClick={() => { (isInJunkFolder ? onUndoSpam : onMarkAsSpam)?.(); setShowMoreActions(false); }}
                      className={cn(
                        "w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2",
                        isInJunkFolder ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                      )}
                    >
                      {isInJunkFolder ? (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          {t('spam.not_spam_title')}
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4 h-4" />
                          {t('spam.button_title')}
                        </>
                      )}
                    </button>
                  )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sender Info - Desktop only (hidden on mobile/tablet, they see it in scrollable content) */}
      <div className="hidden lg:block bg-background border-b border-border">
          <div className="flex items-start gap-4 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowSenderInfo(!showSenderInfo)}
              className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <Avatar
                name={sender?.name}
                email={sender?.email}
                size="lg"
                className="shadow-sm w-12 h-12"
              />
            </button>

            <div className="flex-1 min-w-0">
              {/* Sender line with compact badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowSenderInfo(!showSenderInfo)}
                  className="font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  {sender?.name || sender?.email || t('unknown_sender')}
                </button>
                <EmailIdentityBadge email={email} identities={identities} />
              </div>

              {/* Recipient section - separate line */}
              <div className="mt-2 space-y-1">
                {email.to && email.to.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted-foreground">{t('recipient_to_prefix')}</span>
                    <span className="text-foreground">
                      {formatRecipients(email.to, currentUserEmail, t)}
                    </span>
                    {email.to.length > 2 && (
                      <button
                        onClick={() => setShowFullHeaders(!showFullHeaders)}
                        className="ml-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {t('more_count', { count: email.to.length - 2 })}
                      </button>
                    )}
                  </div>
                )}

                {email.cc && email.cc.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted-foreground">CC:</span>
                    <span className="text-foreground">
                      {email.cc.slice(0, 2).map(r => r.name || r.email).join(", ")}
                      {email.cc.length > 2 && ` +${email.cc.length - 2}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Details toggle - stays in place when expanded */}
              <button
                onClick={() => setShowFullHeaders(!showFullHeaders)}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                {showFullHeaders ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    {t('hide_details')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    {t('show_details')}
                  </>
                )}
              </button>

              {/* Expandable Details */}
              {showFullHeaders && (
                <div className="mt-3 space-y-3">
                  {/* Security & Authentication Section */}
                  {(email.authenticationResults || email.spamScore !== undefined) && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {t('security_authentication')}
                        </h3>
                      </div>
                      <div className="bg-background p-4 space-y-3">
                        {/* Authentication Results */}
                        {email.authenticationResults && (
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* SPF Check */}
                            {email.authenticationResults.spf && (
                              <div className="group/spf relative">
                                <div className={cn(
                                  "px-3 py-2 rounded-md",
                                  getSecurityStatus(email.authenticationResults.spf.result).bgColor,
                                  getSecurityStatus(email.authenticationResults.spf.result).borderColor
                                )}>
                                  <div className="flex items-center gap-2">
                                    {getSecurityStatus(email.authenticationResults.spf.result).icon === 'check' &&
                                      <Check className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.spf.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.spf.result).icon === 'x' &&
                                      <X className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.spf.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.spf.result).icon === 'alert' &&
                                      <AlertTriangle className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.spf.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.spf.result).icon === 'minus' &&
                                      <Minus className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.spf.result).color)} />}
                                    <div>
                                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100">SPF</div>
                                      <div className={cn("text-xs capitalize", getSecurityStatus(email.authenticationResults.spf.result).color)}>
                                        {email.authenticationResults.spf.result}
                                      </div>
                                    </div>
                                  </div>
                                  {email.authenticationResults.spf.domain && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate" title={email.authenticationResults.spf.domain}>
                                      {email.authenticationResults.spf.domain}
                                    </div>
                                  )}
                                </div>
                                <div className="absolute invisible group-hover/spf:visible bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-lg shadow-lg max-w-xs z-50 whitespace-normal pointer-events-none">
                                  {t(`security.tooltip.spf_${email.authenticationResults.spf.result}`)}
                                </div>
                              </div>
                            )}

                            {/* DKIM Check */}
                            {email.authenticationResults.dkim && (
                              <div className="group/dkim relative">
                                <div className={cn(
                                  "px-3 py-2 rounded-md",
                                  getSecurityStatus(email.authenticationResults.dkim.result).bgColor,
                                  getSecurityStatus(email.authenticationResults.dkim.result).borderColor
                                )}>
                                  <div className="flex items-center gap-2">
                                    {getSecurityStatus(email.authenticationResults.dkim.result).icon === 'check' &&
                                      <Check className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dkim.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.dkim.result).icon === 'x' &&
                                      <X className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dkim.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.dkim.result).icon === 'alert' &&
                                      <AlertTriangle className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dkim.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.dkim.result).icon === 'minus' &&
                                      <Minus className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dkim.result).color)} />}
                                    <div>
                                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100">DKIM</div>
                                      <div className={cn("text-xs capitalize", getSecurityStatus(email.authenticationResults.dkim.result).color)}>
                                        {email.authenticationResults.dkim.result}
                                      </div>
                                    </div>
                                  </div>
                                  {email.authenticationResults.dkim.domain && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate" title={email.authenticationResults.dkim.domain}>
                                      {email.authenticationResults.dkim.domain}
                                    </div>
                                  )}
                                </div>
                                <div className="absolute invisible group-hover/dkim:visible bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-lg shadow-lg max-w-xs z-50 whitespace-normal pointer-events-none">
                                  {t(`security.tooltip.dkim_${email.authenticationResults.dkim.result}`)}
                                </div>
                              </div>
                            )}

                            {/* DMARC Check */}
                            {email.authenticationResults.dmarc && (
                              <div className="group/dmarc relative">
                                <div className={cn(
                                  "px-3 py-2 rounded-md",
                                  getSecurityStatus(email.authenticationResults.dmarc.result).bgColor,
                                  getSecurityStatus(email.authenticationResults.dmarc.result).borderColor
                                )}>
                                  <div className="flex items-center gap-2">
                                    {getSecurityStatus(email.authenticationResults.dmarc.result).icon === 'check' &&
                                      <Check className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dmarc.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.dmarc.result).icon === 'x' &&
                                      <X className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dmarc.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.dmarc.result).icon === 'alert' &&
                                      <AlertTriangle className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dmarc.result).color)} />}
                                    {getSecurityStatus(email.authenticationResults.dmarc.result).icon === 'minus' &&
                                      <Minus className={cn("w-4 h-4", getSecurityStatus(email.authenticationResults.dmarc.result).color)} />}
                                    <div>
                                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100">DMARC</div>
                                      <div className={cn("text-xs capitalize", getSecurityStatus(email.authenticationResults.dmarc.result).color)}>
                                        {email.authenticationResults.dmarc.result}
                                      </div>
                                    </div>
                                  </div>
                                  {email.authenticationResults.dmarc.policy && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                      Policy: {email.authenticationResults.dmarc.policy}
                                    </div>
                                  )}
                                </div>
                                <div className="absolute invisible group-hover/dmarc:visible bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-lg shadow-lg max-w-xs z-50 whitespace-normal pointer-events-none">
                                  {t(`security.tooltip.dmarc_${email.authenticationResults.dmarc.result}`)}
                                </div>
                              </div>
                            )}

                            {/* Spam Score */}
                            {email.spamScore !== undefined && (
                              <div className={cn(
                                "px-3 py-2 rounded-md",
                                email.spamScore > 5 ? "bg-gray-50 dark:bg-gray-800 border-l-4 border-red-600 dark:border-red-500" :
                                email.spamScore > 2 ? "bg-gray-50 dark:bg-gray-800 border-l-4 border-amber-600 dark:border-amber-500" :
                                "bg-gray-50 dark:bg-gray-800 border-l-4 border-green-600 dark:border-green-500"
                              )}>
                                <div className="flex items-center gap-2">
                                  <Shield className={cn(
                                    "w-4 h-4",
                                    email.spamScore > 5 ? "text-red-700 dark:text-red-400" :
                                    email.spamScore > 2 ? "text-amber-700 dark:text-amber-400" :
                                    "text-green-700 dark:text-green-400"
                                  )} />
                                  <div>
                                    <div className="text-xs font-medium text-gray-900 dark:text-gray-100">Spam Score</div>
                                    <div className={cn(
                                      "text-xs",
                                      email.spamScore > 5 ? "text-red-700 dark:text-red-400" :
                                      email.spamScore > 2 ? "text-amber-700 dark:text-amber-400" :
                                      "text-green-700 dark:text-green-400"
                                    )}>
                                      {email.spamScore.toFixed(1)}
                                    </div>
                                  </div>
                                </div>
                                {email.spamStatus && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 capitalize">
                                    {email.spamStatus}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Spam analysis (X-Spam-LLM header) */}
                        {email.spamLLM && (
                          <div className={cn(
                            "mt-3 px-4 py-3 rounded-lg",
                            email.spamLLM.verdict === 'LEGITIMATE'
                              ? "bg-gray-50 dark:bg-gray-800 border-l-4 border-green-600 dark:border-green-500"
                              : email.spamLLM.verdict === 'SPAM'
                              ? "bg-gray-50 dark:bg-gray-800 border-l-4 border-red-600 dark:border-red-500"
                              : "bg-gray-50 dark:bg-gray-800 border-l-4 border-amber-600 dark:border-amber-500"
                          )}>
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                {email.spamLLM.verdict === 'LEGITIMATE' ? (
                                  <div className="flex items-center gap-1.5">
                                    <Brain className="w-4 h-4 text-green-700 dark:text-green-400" />
                                    <Sparkles className="w-3 h-3 text-green-700 dark:text-green-400" />
                                  </div>
                                ) : email.spamLLM.verdict === 'SPAM' ? (
                                  <ShieldAlert className="w-4 h-4 text-red-700 dark:text-red-400" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn(
                                    "text-xs font-semibold uppercase tracking-wide",
                                    email.spamLLM.verdict === 'LEGITIMATE'
                                      ? "text-green-700 dark:text-green-400"
                                      : email.spamLLM.verdict === 'SPAM'
                                      ? "text-red-700 dark:text-red-400"
                                      : "text-amber-700 dark:text-amber-400"
                                  )}>
                                    Spam Analysis: {email.spamLLM.verdict}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                  {email.spamLLM.explanation}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Technical Details Section - Only show if we have useful technical info */}
                  {(email.messageId || email.replyTo?.length || (email.sentAt && email.receivedAt &&
                    Math.abs(new Date(email.sentAt).getTime() - new Date(email.receivedAt).getTime()) > 60000)) && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
                          <Network className="w-3.5 h-3.5" />
                          {t('technical_details')}
                        </h3>
                      </div>
                      <div className="bg-background p-4">
                        <div className="space-y-3 text-xs">
                          {/* Message ID */}
                          {email.messageId && (
                            <div className="flex items-start gap-2">
                              <Hash className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-muted-foreground">{t('message_id_label')}</span>
                                <div className="text-foreground break-all font-mono text-xs mt-0.5">
                                  {email.messageId}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Reply-To if different from sender */}
                          {email.replyTo && email.replyTo.length > 0 &&
                           (!email.from || email.replyTo[0].email !== email.from[0]?.email) && (
                            <div className="flex items-start gap-2">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                              <div className="flex-1">
                                <span className="font-medium text-muted-foreground">{t('reply_to_label')}</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {email.replyTo.map((recipient, i) => (
                                    <span key={i} className="inline-flex items-center px-2 py-1 bg-accent/50 border border-accent rounded text-xs">
                                      {recipient.name && <span className="font-medium mr-1 text-accent-foreground">{recipient.name}</span>}
                                      <span className="text-accent-foreground/90">{recipient.email}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Time delay if significant (>1 minute difference) */}
                          {email.sentAt && email.receivedAt &&
                           Math.abs(new Date(email.sentAt).getTime() - new Date(email.receivedAt).getTime()) > 60000 && (
                            <div className="flex items-start gap-2">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                              <div className="flex-1">
                                <span className="font-medium text-muted-foreground">{t('delivery_time_label')}</span>
                                <div className="text-foreground">
                                  {(() => {
                                    const diff = Math.abs(new Date(email.receivedAt).getTime() - new Date(email.sentAt).getTime());
                                    const minutes = Math.floor(diff / 60000);
                                    const hours = Math.floor(minutes / 60);
                                    const days = Math.floor(hours / 24);
                                    const dayUnit = days > 1 ? t('time.days') : t('time.day');
                                    const hourUnit = (hours % 24) > 1 ? t('time.hours') : t('time.hour');
                                    const minuteUnit = (minutes % 60) > 1 ? t('time.minutes') : t('time.minute');
                                    const minuteUnitSingle = minutes > 1 ? t('time.minutes') : t('time.minute');
                                    if (days > 0) return `${days} ${dayUnit} ${hours % 24} ${hourUnit}`;
                                    if (hours > 0) return `${hours} ${hours > 1 ? t('time.hours') : t('time.hour')} ${minutes % 60} ${minuteUnit}`;
                                    return `${minutes} ${minuteUnitSingle}`;
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Part of conversation */}
                          {email.references && email.references.length > 0 && (
                            <div className="flex items-start gap-2">
                              <List className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-muted-foreground">{t('conversation_part_label')}</span>
                                <div className="text-foreground text-xs mt-0.5">
                                  {t(email.references.length === 1 ? 'previous_messages' : 'previous_messages_plural', { count: email.references.length })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
          {showSenderInfo && sender && (
            <SenderInfoPanel
              sender={sender}
              onSearch={(email) => onSearchSender?.(email)}
              onAddContact={(name, email) => onAddContact?.(name, email)}
            />
          )}
      </div>

      {/* Email Content Area */}
      <div id="email-content-area" className="flex-1 overflow-auto bg-muted/30">
        {/* Mobile/Tablet Sender Info - scrolls with content */}
        <div className="lg:hidden bg-background border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setShowSenderInfo(!showSenderInfo)}
              className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <Avatar
                name={sender?.name}
                email={sender?.email}
                size="lg"
                className="shadow-sm w-10 h-10"
              />
            </button>
            <div className="flex-1 min-w-0">
              {/* Mobile 2-line layout */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowSenderInfo(!showSenderInfo)}
                  className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  {sender?.name || sender?.email || t('unknown_sender')}
                </button>
                <EmailIdentityBadge email={email} identities={identities} />
              </div>
              <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                {sender?.email && sender?.name && (
                  <>
                    <span className="truncate">{sender.email}</span>
                    <span>·</span>
                  </>
                )}
                {email.to && email.to.length > 0 && (
                  <>
                    <span>→ {t('recipient_to_prefix')}</span>
                    <span className="text-foreground">
                      {formatRecipients(email.to, currentUserEmail, t)}
                    </span>
                  </>
                )}
              </div>
              {/* CC line (mobile - only if present) */}
              {email.cc && email.cc.length > 0 && (
                <div className="mt-1 flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">CC:</span>
                  <span className="text-foreground truncate">
                    {email.cc.slice(0, 2).map(r => r.name || r.email).join(", ")}
                    {email.cc.length > 2 && ` +${email.cc.length - 2}`}
                  </span>
                </div>
              )}
            </div>
          </div>
          {showSenderInfo && sender && (
            <SenderInfoPanel
              sender={sender}
              onSearch={(email) => onSearchSender?.(email)}
              onAddContact={(name, email) => onAddContact?.(name, email)}
            />
          )}
        </div>

        {/* Unified Notification Banner - External Content + Unsubscribe + Calendar Invitation */}
        {((hasBlockedContent && !allowExternalContent && externalContentPolicy !== 'allow') ||
          (shouldShowUnsubBanner && listHeaders?.listUnsubscribe) ||
          hasCalendarInvitation) && (
          <div className="border-b border-border bg-muted/30 isolate">
            <div className="max-w-4xl mx-auto px-6 py-1.5">
              <div className="flex flex-col gap-3 isolate">
                {/* External Content Controls */}
                {hasBlockedContent && !allowExternalContent && externalContentPolicy !== 'allow' && (
                  <div className="flex items-center gap-3 flex-wrap md:justify-center rounded-md px-3 py-1 bg-muted/50 dark:bg-muted/30">
                    {externalContentPolicy === 'ask' && (
                      <button
                        onClick={() => setAllowExternalContent(true)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent transition-colors min-h-[44px] md:min-h-0"
                      >
                        <Image className="w-3.5 h-3.5" />
                        {t('load_external_content')}
                      </button>
                    )}
                    {email.from?.[0]?.email && (
                      <button
                        onClick={() => {
                          const senderEmail = email.from?.[0]?.email;
                          if (senderEmail) {
                            addTrustedSender(senderEmail);
                            setAllowExternalContent(true);
                          }
                        }}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent transition-colors min-h-[44px] md:min-h-0"
                      >
                        {t('trust_sender')}
                      </button>
                    )}
                  </div>
                )}

                {/* Unsubscribe Controls */}
                {shouldShowUnsubBanner && listHeaders?.listUnsubscribe && (
                  <div className="flex items-center md:justify-center rounded-md px-3 py-1 bg-blue-50/50 dark:bg-blue-950/20">
                    <UnsubscribeBanner
                      listUnsubscribe={listHeaders.listUnsubscribe}
                      senderEmail={email?.from?.[0]?.email || ''}
                      onDismiss={() => {
                        const messageId = email?.messageId || '';
                        const newSet = new Set(dismissedUnsubBanners).add(messageId);
                        setDismissedUnsubBanners(newSet);
                        localStorage.setItem('dismissed-unsub-banners', JSON.stringify([...newSet]));
                      }}
                    />
                  </div>
                )}

                {/* Calendar Invitation Banner */}
                {hasCalendarInvitation && (
                  <div className="rounded-md px-3 py-1 bg-amber-50/50 dark:bg-amber-950/20">
                    <CalendarInvitationBanner email={email} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto p-6">

          {/* Attachments (excluding inline images that the body actually cites via cid:) */}
          {email.attachments && email.attachments.filter(a => !isInlineAttachment(a)).length > 0 && (
            <div className="mb-4">
              {/* Image attachments as thumbnails */}
              {email.attachments.filter(a =>
                !isInlineAttachment(a) && (
                a.type?.startsWith('image/') ||
                ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || ''))
              ).length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {email.attachments
                      .filter(a =>
                        !isInlineAttachment(a) && (
                        a.type?.startsWith('image/') ||
                        ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || ''))
                      )
                      .map((attachment, i) => (
                        <div
                          key={i}
                          className="relative group cursor-pointer"
                          title={attachment.name}
                          onClick={() => {
                            if (attachment.blobId && onDownloadAttachment) {
                              onDownloadAttachment(attachment.blobId, attachment.name || 'download', attachment.type);
                            }
                          }}
                        >
                          <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                            <div className="w-full h-full flex items-center justify-center">
                              <FileImage className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                            </div>
                          </div>
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <Download className="w-6 h-6 text-white" />
                          </div>
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 truncate max-w-[128px]">
                            {attachment.name}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Non-image attachments in a compact list */}
              {email.attachments.filter(a =>
                !isInlineAttachment(a) &&
                !a.type?.startsWith('image/') &&
                !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || '')
              ).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  {email.attachments
                    .filter(a =>
                      !isInlineAttachment(a) &&
                      !a.type?.startsWith('image/') &&
                      !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || '')
                    )
                    .map((attachment, i) => {
                      const FileIcon = getFileIcon(attachment.name, attachment.type);
                      return (
                        <button
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted hover:bg-accent rounded-md transition-colors group"
                          title={`Download ${attachment.name} (${formatFileSize(attachment.size)})`}
                          onClick={() => {
                            if (attachment.blobId && onDownloadAttachment) {
                              onDownloadAttachment(attachment.blobId, attachment.name || 'download', attachment.type);
                            }
                          }}
                        >
                          <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm text-foreground">
                            {attachment.name || "Unnamed"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({formatFileSize(attachment.size)})
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Email Body */}
          <div className="bg-background rounded-lg shadow-sm border border-border overflow-x-auto">
            <div className="email-content-wrapper p-6">
              {emailContent.isHtml && emailContent.useIframe ? (
                <SandboxedEmailFrame html={emailContent.html} className="w-full" />
              ) : emailContent.isHtml ? (
                <div
                  className="email-content prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: emailContent.html }}
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    fontSize: '14px',
                    lineHeight: '1.6',
                  }}
                />
              ) : (
                <div
                  className="email-content-text text-foreground"
                  dangerouslySetInnerHTML={{ __html: emailContent.html }}
                  style={{
                    fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    wordBreak: 'break-word',
                  }}
                />
              )}
            </div>
          </div>

          {/* Quick Reply Section */}
          <div className={cn(
            "print:hidden mt-6 bg-background rounded-lg shadow-sm border transition-all",
            isQuickReplyFocused || quickReplyText ? "border-primary" : "border-border"
          )}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <Avatar
                  name={currentUserName || "You"}
                  email={currentUserEmail || ""}
                  size="sm"
                />
                <div className="flex-1 space-y-3">
                  <textarea
                    value={quickReplyText}
                    onChange={(e) => setQuickReplyText(e.target.value)}
                    onFocus={() => setIsQuickReplyFocused(true)}
                    placeholder={t('quick_reply_placeholder')}
                    className={cn(
                      "w-full px-3 py-2 text-sm border border-border bg-background text-foreground rounded-lg",
                      "hover:border-accent focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all",
                      "resize-none"
                    )}
                    rows={isQuickReplyFocused || quickReplyText ? 3 : 2}
                    disabled={isSendingQuickReply}
                  />

                  {/* Action buttons - show when focused or has text */}
                  {(isQuickReplyFocused || quickReplyText) && (
                    <div className="flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="text-xs text-muted-foreground">
                        {t('characters_count', { count: quickReplyText.length })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setQuickReplyText("");
                            setIsQuickReplyFocused(false);
                          }}
                          disabled={isSendingQuickReply}
                        >
                          {tCommon('cancel')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onReply?.(quickReplyText);
                            setQuickReplyText("");
                            setIsQuickReplyFocused(false);
                          }}
                          disabled={isSendingQuickReply}
                          className="text-muted-foreground"
                        >
                          <MoreVertical className="w-4 h-4 mr-1" />
                          {t('more_options')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!quickReplyText.trim() || !onQuickReply) return;

                            setIsSendingQuickReply(true);
                            try {
                              await onQuickReply(quickReplyText);
                              setQuickReplyText("");
                              setIsQuickReplyFocused(false);
                            } catch {
                              return;
                            } finally {
                              setIsSendingQuickReply(false);
                            }
                          }}
                          disabled={!quickReplyText.trim() || isSendingQuickReply}
                        >
                          {isSendingQuickReply ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              {t('sending')}
                            </>
                          ) : (
                            <>
                              <Reply className="w-4 h-4 mr-1" />
                              {t('send')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom action bar */}
      {email && (isMobile || isTablet) && (
        <MobileActionBar
          onReply={() => onReply?.()}
          onReplyAll={() => onReplyAll?.()}
          onArchive={() => onArchive?.()}
          onDelete={() => onDelete?.()}
          onForward={() => onForward?.()}
          onStar={() => onToggleStar?.()}
          onMarkUnread={() => email && onMarkAsRead?.(email.id, false)}
          onSpam={() => onMarkAsSpam?.()}
        />
      )}

      {/* Email Source Modal */}
      {showSourceModal && email && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSourceModal(false)}
        >
          <div
            className="bg-background rounded-lg shadow-2xl border border-border w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{t('email_source')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copySourceToClipboard}
                  className="flex items-center gap-1.5"
                >
                  {sourceCopied ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                  {sourceCopied ? tCommon('copied') : t('copy_source')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSourceModal(false)}
                  className="h-10 w-10 lg:h-8 lg:w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 bg-muted/30">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words bg-background border border-border rounded-lg p-4">
                {generateEmailSource(email)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}