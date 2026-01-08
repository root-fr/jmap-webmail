"use client";

import { useState, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { Email } from "@/lib/jmap/types";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { formatFileSize, cn } from "@/lib/utils";
import { getSecurityStatus } from "@/lib/email-headers";
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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { useDeviceDetection } from "@/hooks/use-media-query";

interface EmailViewerProps {
  email: Email | null;
  isLoading?: boolean;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onToggleStar?: () => void;
  onMarkAsRead?: (emailId: string, read: boolean) => void;
  onSetColorTag?: (emailId: string, color: string | null) => void;
  onDownloadAttachment?: (blobId: string, name: string, type?: string) => void;
  onQuickReply?: (body: string) => Promise<void>;
  onBack?: () => void;
  currentUserEmail?: string;
  currentUserName?: string;
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

// Color options for email tags
const colorOptions = [
  { name: "Red", value: "red", color: "bg-red-500" },
  { name: "Orange", value: "orange", color: "bg-orange-500" },
  { name: "Yellow", value: "yellow", color: "bg-yellow-500" },
  { name: "Green", value: "green", color: "bg-green-500" },
  { name: "Blue", value: "blue", color: "bg-blue-500" },
  { name: "Purple", value: "purple", color: "bg-purple-500" },
  { name: "Pink", value: "pink", color: "bg-pink-500" },
];

const getCurrentColor = (keywords: Record<string, boolean> | undefined) => {
  if (!keywords) return null;
  for (const key of Object.keys(keywords)) {
    if (key.startsWith("$color:") && keywords[key] === true) {
      return key.replace("$color:", "");
    }
  }
  return null;
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
  onBack,
  currentUserEmail,
  currentUserName,
  className,
}: EmailViewerProps) {
  const t = useTranslations('email_viewer');
  const tNotifications = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const externalContentPolicy = useSettingsStore((state) => state.externalContentPolicy);
  const addTrustedSender = useSettingsStore((state) => state.addTrustedSender);
  const isSenderTrusted = useSettingsStore((state) => state.isSenderTrusted);

  // Tablet list visibility
  const { isTablet } = useDeviceDetection();
  const { tabletListVisible } = useUIStore();
  const [showFullHeaders, setShowFullHeaders] = useState(false);
  const [allowExternalContent, setAllowExternalContent] = useState(false);
  const [hasBlockedContent, setHasBlockedContent] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState("");
  const [isQuickReplyFocused, setIsQuickReplyFocused] = useState(false);
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const currentColor = getCurrentColor(email?.keywords);

  useEffect(() => {
    // Mark as read when email is viewed
    if (email && !email.keywords?.$seen && onMarkAsRead) {
      onMarkAsRead(email.id, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- email?.id changes when email changes, which is the intended trigger
  }, [email?.id, email?.keywords?.$seen, onMarkAsRead]);

  // Reset external content permission and quick reply when email changes
  // Initialize allowExternalContent based on externalContentPolicy setting
  useEffect(() => {
    // 'allow' = always allow, 'block' = always block, 'ask' = user decides per email
    setAllowExternalContent(externalContentPolicy === 'allow');
    setHasBlockedContent(false);
    setQuickReplyText("");
    setIsQuickReplyFocused(false);
    setShowSourceModal(false);
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

  const copySourceToClipboard = async () => {
    if (!email) return;

    try {
      const source = generateEmailSource(email);
      await navigator.clipboard.writeText(source);
      // Could add a toast notification here
      console.log(tNotifications('source_copied'));
    } catch (err) {
      console.error('Failed to copy source:', err);
    }
  };

  // Sanitize and prepare email HTML content
  const emailContent = useMemo(() => {
    if (!email) return { html: "", isHtml: false };

    // Check if we have body values
    if (email.bodyValues) {
      // Check if HTML content exists and if it's actually rich HTML or just plain text wrapper
      let useHtmlVersion = false;
      let htmlContent = '';

      if (email.htmlBody?.[0]?.partId && email.bodyValues[email.htmlBody[0].partId]) {
        htmlContent = email.bodyValues[email.htmlBody[0].partId].value;

        // Check if HTML is just a minimal wrapper around plain text
        // by checking if it lacks common HTML formatting elements
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const hasRichFormatting = tempDiv.querySelector('table, img, style, b, strong, i, em, u, font, div[style], span[style], p[style], h1, h2, h3, h4, h5, h6, ul, ol, blockquote');
        const hasMultipleParagraphs = tempDiv.querySelectorAll('p').length > 2;
        const hasBrTags = tempDiv.querySelectorAll('br').length > 0;

        // Use HTML if it has rich formatting, multiple paragraphs, or explicit line breaks
        useHtmlVersion = !!(hasRichFormatting || hasMultipleParagraphs || hasBrTags);
      }

      // If we should use HTML version and it exists
      if (useHtmlVersion && htmlContent) {
        // Create a custom DOMPurify hook to handle external content
        let blockedExternalContent = false;

        const sanitizeConfig = {
          ADD_TAGS: ['style'],
          ADD_ATTR: ['target', 'style', 'class', 'width', 'height', 'align', 'valign', 'bgcolor', 'color'],
          ALLOW_DATA_ATTR: false,
          FORCE_BODY: true,
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
          FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
        };

        // Check if sender is trusted
        const senderEmail = email.from?.[0]?.email?.toLowerCase();
        const senderIsTrusted = senderEmail ? isSenderTrusted(senderEmail) : false;

        // Block external content based on policy:
        // 'allow' = never block, 'block' = always block (unless trusted), 'ask' = block until user allows or trusted
        const shouldBlockExternal = !senderIsTrusted && (
          externalContentPolicy === 'block' ||
          (externalContentPolicy === 'ask' && !allowExternalContent)
        );

        if (shouldBlockExternal) {
          sanitizeConfig.FORBID_TAGS.push('link');
          sanitizeConfig.FORBID_ATTR.push('background');

          // Hook to modify src attributes
          DOMPurify.addHook('afterSanitizeAttributes', (node) => {
            const htmlNode = node as HTMLElement;
            // Block external images
            if (node.tagName === 'IMG') {
              const src = node.getAttribute('src');
              if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
                node.setAttribute('data-blocked-src', src);
                // Use a subtle transparent placeholder
                node.setAttribute('src', 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJ0cmFuc3BhcmVudCIvPgo8L3N2Zz4=');
                node.setAttribute('alt', '');
                htmlNode.style.display = 'none'; // Hide blocked images completely for cleaner look
                blockedExternalContent = true;
              }
            }

            // Block external stylesheets and resources in style attributes
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
          });
        }

        // Sanitize HTML to prevent XSS
        const cleanHtml = DOMPurify.sanitize(htmlContent, sanitizeConfig);

        // Remove the hook after sanitization
        DOMPurify.removeAllHooks();

        // Update blocked content state
        if (blockedExternalContent && !hasBlockedContent) {
          setHasBlockedContent(true);
        }

        return {
          html: cleanHtml,
          isHtml: true
        };
      }

      // Use text content if available (either as fallback or when HTML is minimal)
      if (email.textBody?.[0]?.partId && email.bodyValues[email.textBody[0].partId]) {
        const textContent = email.bodyValues[email.textBody[0].partId].value;

        // Convert plain text to HTML with proper formatting
        const htmlFromText = textContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\r\n/g, '<br>')  // Windows line endings
          .replace(/\r/g, '<br>')    // Old Mac line endings
          .replace(/\n/g, '<br>')    // Unix line endings
          .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')  // Convert tabs to spaces
          .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); // Don't match across tags

        return {
          html: htmlFromText,
          isHtml: false
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
        html: `<div style="color: #666; font-style: italic;">${previewHtml}</div>`,
        isHtml: false
      };
    }

    return {
      html: '<p style="color: #999;">No content available</p>',
      isHtml: false
    };
  }, [email, allowExternalContent, hasBlockedContent, externalContentPolicy, isSenderTrusted]);

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
                className="h-10 w-10 flex-shrink-0 -ml-2"
                aria-label={t('back_to_list')}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg lg:text-2xl font-bold text-foreground tracking-tight truncate pr-2">
                {email.subject || "(no subject)"}
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
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* Loading indicator */}
              {isLoading && (
                <div className="mr-2 flex items-center gap-1.5 text-muted-foreground hidden lg:flex">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">{t('loading')}</span>
                </div>
              )}
              {/* Primary Reply Button */}
              <Button
                onClick={onReply}
                size="sm"
                className="mr-1 h-8 lg:h-9"
                title="Reply"
              >
                <Reply className="w-4 h-4" />
                <span className="ml-1.5 hidden lg:inline">Reply</span>
              </Button>

              {/* Reply Options Dropdown - hidden on mobile/tablet */}
              <div className="relative group mr-3 hidden lg:block">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-muted"
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
                className="h-8 w-8 hover:bg-muted hidden lg:flex"
                title="Archive"
              >
                <Archive className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-8 w-8 hover:bg-muted"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleStar}
                className="h-8 w-8 hover:bg-muted hidden lg:flex"
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
              <div className="relative group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-muted"
                  title={t('more_actions')}
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </Button>
                <div className="absolute right-0 top-full mt-1 w-44 bg-background rounded-md shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <button
                    onClick={() => setShowSourceModal(true)}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <Code className="w-4 h-4" />
                    {t('view_source')}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    {t('print')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sender Info - Desktop only (hidden on mobile/tablet, they see it in scrollable content) */}
      <div className="hidden lg:block bg-background border-b border-border px-6 py-4">
          <div className="flex items-start gap-4">
            <Avatar
              name={sender?.name}
              email={sender?.email}
              size="lg"
              className="shadow-sm w-12 h-12"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">
                  {sender?.name || sender?.email || t('unknown_sender')}
                </span>
                {sender?.email && sender?.name && (
                  <span className="text-sm text-muted-foreground">
                    &lt;{sender.email}&gt;
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-1">
                {email.to && email.to.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted-foreground">To:</span>
                    <span className="text-foreground">
                      {email.to.slice(0, 2).map(r => r.name || r.email).join(", ")}
                      {email.to.length > 2 && (
                        <button
                          onClick={() => setShowFullHeaders(!showFullHeaders)}
                          className="ml-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {t('more_count', { count: email.to.length - 2 })}
                        </button>
                      )}
                    </span>
                  </div>
                )}

                {(email.cc && email.cc.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted-foreground">CC:</span>
                    <span className="text-foreground">
                      {email.cc.map(r => r.name || r.email).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Modern Expandable Details */}
              {showFullHeaders && (
                <div className="mt-4 space-y-3">
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
                            )}

                            {/* DKIM Check */}
                            {email.authenticationResults.dkim && (
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
                            )}

                            {/* DMARC Check */}
                            {email.authenticationResults.dmarc && (
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

                        {/* AI Analysis (X-Spam-LLM) - Full width card */}
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
                                    AI Analysis: {email.spamLLM.verdict}
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

              <button
                onClick={() => setShowFullHeaders(!showFullHeaders)}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                {showFullHeaders ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show details
                  </>
                )}
              </button>
            </div>
          </div>
      </div>

      {/* Email Content Area */}
      <div className="flex-1 overflow-auto bg-muted/30">
        {/* Mobile/Tablet Sender Info - scrolls with content */}
        <div className="lg:hidden bg-background border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <Avatar
              name={sender?.name}
              email={sender?.email}
              size="lg"
              className="shadow-sm w-10 h-10"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">
                  {sender?.name || sender?.email || t('unknown_sender')}
                </span>
                {sender?.email && sender?.name && (
                  <span className="text-sm text-muted-foreground">
                    &lt;{sender.email}&gt;
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {email.to && email.to.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted-foreground">To:</span>
                    <span className="text-foreground truncate">
                      {email.to.slice(0, 2).map(r => r.name || r.email).join(", ")}
                      {email.to.length > 2 && ` +${email.to.length - 2}`}
                    </span>
                  </div>
                )}
                {email.cc && email.cc.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="text-muted-foreground">CC:</span>
                    <span className="text-foreground truncate">
                      {email.cc.slice(0, 2).map(r => r.name || r.email).join(", ")}
                      {email.cc.length > 2 && ` +${email.cc.length - 2}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* External Content Banner - show in 'ask' or 'block' mode */}
        {hasBlockedContent && !allowExternalContent && externalContentPolicy !== 'allow' && (
          <div className="border-b border-border">
            <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-center gap-4">
              {/* Load images button - only in 'ask' mode */}
              {externalContentPolicy === 'ask' && (
                <button
                  onClick={() => setAllowExternalContent(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Image className="w-3.5 h-3.5" />
                  {t('load_external_content')}
                </button>
              )}
              {/* Trust sender button - in both 'ask' and 'block' modes */}
              {email.from?.[0]?.email && (
                <>
                  {externalContentPolicy === 'ask' && <span className="text-muted-foreground/50">|</span>}
                  <button
                    onClick={() => {
                      const senderEmail = email.from?.[0]?.email;
                      if (senderEmail) {
                        addTrustedSender(senderEmail);
                        setAllowExternalContent(true);
                      }
                    }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('trust_sender')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto p-6">

          {/* Inline Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mb-4">
              {/* Image attachments as thumbnails */}
              {email.attachments.filter(a =>
                a.type?.startsWith('image/') ||
                ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || '')
              ).length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {email.attachments
                      .filter(a =>
                        a.type?.startsWith('image/') ||
                        ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || '')
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
                !a.type?.startsWith('image/') &&
                !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(a.name?.split('.').pop()?.toLowerCase() || '')
              ).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  {email.attachments
                    .filter(a =>
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
              {emailContent.isHtml ? (
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
            "mt-6 bg-background rounded-lg shadow-sm border transition-all",
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
                    rows={isQuickReplyFocused || quickReplyText ? 3 : 1}
                    disabled={isSendingQuickReply}
                  />

                  {/* Action buttons - show when focused or has text */}
                  {(isQuickReplyFocused || quickReplyText) && (
                    <div className="flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="text-xs text-muted-foreground">
                        {quickReplyText.length > 0 && t('characters_count', { count: quickReplyText.length })}
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
                          onClick={onReply}
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
                            } catch (error) {
                              console.error("Failed to send quick reply:", error);
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
                  <Copy className="w-4 h-4" />
                  {t('copy_source')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSourceModal(false)}
                  className="h-8 w-8"
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