"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Paperclip, Send, Save, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

interface EmailComposerProps {
  onSend?: (data: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    draftId?: string;
    fromEmail?: string;
    identityId?: string;
  }) => void;
  onClose?: () => void;
  onDiscardDraft?: (draftId: string) => void;
  className?: string;
  mode?: 'compose' | 'reply' | 'replyAll' | 'forward';
  replyTo?: {
    from?: { email?: string; name?: string }[];
    to?: { email?: string; name?: string }[];
    cc?: { email?: string; name?: string }[];
    subject?: string;
    body?: string;
    receivedAt?: string;
  };
}

export function EmailComposer({
  onSend,
  onClose,
  onDiscardDraft,
  className,
  mode = 'compose',
  replyTo
}: EmailComposerProps) {
  const t = useTranslations('email_composer');

  // Initialize with reply/forward data if provided
  const getInitialTo = () => {
    if (!replyTo) return "";
    if (mode === 'reply') {
      return replyTo.from?.[0]?.email || "";
    } else if (mode === 'replyAll') {
      const from = replyTo.from?.[0]?.email || "";
      const originalTo = replyTo.to?.filter(r => r.email).map(r => r.email).join(", ") || "";
      return [from, originalTo].filter(Boolean).join(", ");
    }
    return "";
  };

  const getInitialCc = () => {
    if (!replyTo || mode !== 'replyAll') return "";
    return replyTo.cc?.map(r => r.email).join(", ") || "";
  };

  const getInitialSubject = () => {
    if (!replyTo?.subject) return "";
    if (mode === 'forward') {
      return `Fwd: ${replyTo.subject.replace(/^(Fwd:\s*)+/i, '')}`;
    } else if (mode === 'reply' || mode === 'replyAll') {
      return `Re: ${replyTo.subject.replace(/^(Re:\s*)+/i, '')}`;
    }
    return "";
  };

  const getInitialBody = () => {
    if (!replyTo?.body) return "";

    const date = replyTo.receivedAt ? new Date(replyTo.receivedAt).toLocaleString() : "";
    const from = replyTo.from?.[0];
    const fromStr = from ? `${from.name || from.email}` : "Unknown";

    if (mode === 'forward') {
      return `\n\n---------- Forwarded message ----------\nFrom: ${fromStr}\nDate: ${date}\nSubject: ${replyTo.subject || ""}\n\n${replyTo.body}`;
    } else if (mode === 'reply' || mode === 'replyAll') {
      return `\n\nOn ${date}, ${fromStr} wrote:\n> ${replyTo.body.split('\n').join('\n> ')}`;
    }
    return "";
  };

  const [to, setTo] = useState(getInitialTo());
  const [cc, setCc] = useState(getInitialCc());
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(getInitialSubject());
  const [body, setBody] = useState(getInitialBody());
  const [showCc, setShowCc] = useState(!!getInitialCc());
  const [showBcc, setShowBcc] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>("");
  const [attachments, setAttachments] = useState<Array<{ file: File; blobId?: string; uploading?: boolean; error?: boolean }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);

  const { client, identities, primaryIdentity } = useAuthStore();

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!client || !event.target.files) return;

    const files = Array.from(event.target.files);

    // Add files to attachments list with uploading state
    const newAttachments = files.map(file => ({ file, uploading: true }));
    setAttachments(prev => [...prev, ...newAttachments]);

    // Upload each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const { blobId } = await client.uploadBlob(file);

        // Update attachment with blobId
        setAttachments(prev =>
          prev.map(att =>
            att.file === file
              ? { ...att, blobId, uploading: false }
              : att
          )
        );
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);

        // Mark attachment as failed
        setAttachments(prev =>
          prev.map(att =>
            att.file === file
              ? { ...att, uploading: false, error: true }
              : att
          )
        );
      }
    }

    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-save draft functionality
  const saveDraft = async (): Promise<string | null> => {
    if (!client) return null;

    const toAddresses = to.split(",").map(e => e.trim()).filter(Boolean);
    const ccAddresses = cc.split(",").map(e => e.trim()).filter(Boolean);
    const bccAddresses = bcc.split(",").map(e => e.trim()).filter(Boolean);

    // Only save if there's some content
    if (!toAddresses.length && !subject && !body) {
      return null;
    }

    // Prepare attachments for draft
    const uploadedAttachments = attachments
      .filter(att => att.blobId && !att.uploading)
      .map(att => ({
        blobId: att.blobId!,
        name: att.file.name,
        type: att.file.type,
        size: att.file.size,
      }));

    // Create a hash of current data to compare with last saved
    const currentData = JSON.stringify({ to: toAddresses, cc: ccAddresses, bcc: bccAddresses, subject, body, attachments: uploadedAttachments });

    // Only save if data has changed
    if (currentData === lastSavedDataRef.current) {
      return draftId;
    }

    setSaveStatus('saving');

    try {
      const savedDraftId = await client.createDraft(
        toAddresses,
        subject || "(No subject)",
        body,
        ccAddresses,
        bccAddresses,
        draftId || undefined,
        uploadedAttachments
      );

      setDraftId(savedDraftId);
      lastSavedDataRef.current = currentData;
      setSaveStatus('saved');

      // Reset status after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);

      return savedDraftId;
    } catch (error) {
      console.error('Failed to save draft:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return null;
    }
  };

  // Trigger auto-save when content changes
  useEffect(() => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Don't auto-save if there's no content
    if (!to && !subject && !body) {
      return;
    }

    // Set new timeout for auto-save (2 seconds after last change)
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 2000);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- saveDraft reads current state when called, not when effect is set up
  }, [to, cc, bcc, subject, body, attachments]);

  const handleSend = async () => {
    const toAddresses = to.split(",").map(e => e.trim()).filter(Boolean);
    const ccAddresses = cc.split(",").map(e => e.trim()).filter(Boolean);
    const bccAddresses = bcc.split(",").map(e => e.trim()).filter(Boolean);

    // Allow sending if we have recipient, subject, and either body text or attachments
    const hasContent = body || attachments.some(att => att.blobId && !att.uploading);

    if (toAddresses.length > 0 && subject && hasContent) {
      // Wait for any pending auto-save to complete and get the latest draft ID
      let finalDraftId = draftId;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // saveDraft returns the new draft ID after destroy+create
        const savedId = await saveDraft();
        if (savedId) {
          finalDraftId = savedId;
        }
      }

      // Get the selected identity or primary identity
      const currentIdentity = selectedIdentityId
        ? identities.find(id => id.id === selectedIdentityId)
        : primaryIdentity;

      onSend?.({
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject,
        body,
        draftId: finalDraftId || undefined,
        fromEmail: currentIdentity?.email,
        identityId: currentIdentity?.id,
      });

      // Reset form
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setDraftId(null);
    }
  };

  const handleClose = () => {
    // If there's a draft with content, ask user if they want to discard
    if (draftId && (to || subject || body)) {
      const confirmDiscard = window.confirm(t('discard_draft_confirm'));

      if (confirmDiscard) {
        // Clear any pending auto-save
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        // Delete the draft if callback is provided
        if (onDiscardDraft) {
          onDiscardDraft(draftId);
        }

        onClose?.();
      }
    } else {
      onClose?.();
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background border rounded-lg", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{t('new_message')}</h3>
          {saveStatus === 'saving' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Save className="w-3 h-3 animate-pulse" />
              <span>{t('saving')}</span>
            </div>
          )}
          {saveStatus === 'saved' && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3 h-3" />
              <span>{t('draft_saved')}</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-1 text-xs text-red-600">
              <X className="w-3 h-3" />
              <span>{t('save_failed')}</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="space-y-2 px-4 py-3 border-b">
          {/* From field - show dropdown if multiple identities, otherwise display email */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16">{t('from')}:</span>
            {identities.length > 1 ? (
              <select
                value={selectedIdentityId || primaryIdentity?.id || ''}
                onChange={(e) => setSelectedIdentityId(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground outline-none cursor-pointer hover:text-muted-foreground transition-colors"
              >
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.name ? `${identity.name} <${identity.email}>` : identity.email}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-foreground">
                {primaryIdentity?.name
                  ? `${primaryIdentity.name} <${primaryIdentity.email}>`
                  : primaryIdentity?.email || ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16">{t('to')}:</span>
            <Input
              type="email"
              placeholder={t('to_placeholder')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 border-0 focus-visible:ring-0"
            />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCc(!showCc)}
                className="text-xs"
              >
                Cc
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBcc(!showBcc)}
                className="text-xs"
              >
                Bcc
              </Button>
            </div>
          </div>

          {showCc && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-16">{t('cc_label')}</span>
              <Input
                type="email"
                placeholder={t('cc_placeholder')}
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="flex-1 border-0 focus-visible:ring-0"
              />
            </div>
          )}

          {showBcc && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-16">{t('bcc_label')}</span>
              <Input
                type="email"
                placeholder={t('bcc_placeholder')}
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="flex-1 border-0 focus-visible:ring-0"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16">{t('subject_label')}</span>
            <Input
              type="text"
              placeholder={t('subject_placeholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 border-0 focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex-1 px-4 py-3 min-h-0">
          <textarea
            className="w-full h-full resize-none outline-none text-sm bg-transparent text-foreground placeholder:text-muted-foreground"
            placeholder={t('body_placeholder')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {/* Attachments display */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 border-t">
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-md text-sm",
                    att.error ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-foreground"
                  )}
                >
                  {att.uploading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : att.error ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : (
                    <Paperclip className="w-3 h-3" />
                  )}
                  <span className="max-w-[200px] truncate">{att.file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(att.file.size / 1024).toFixed(1)} {t('file_size_kb')})
                  </span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t">
          {/* Left side - Discard button */}
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-muted-foreground hover:text-red-500 transition-colors"
          >
            {t('discard')}
          </button>

          {/* Right side - Attach and Send */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="*/*"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-4 h-4 mr-2" />
              {t('attach')}
            </Button>
            <Button onClick={handleSend}>
              <Send className="w-4 h-4 mr-2" />
              {t('send')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}