"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { X, Paperclip, Send, Save, Check, Loader2, AlertCircle, FileText, BookmarkPlus } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { debug } from "@/lib/debug";
import { toast } from "@/stores/toast-store";
import { useAuthStore } from "@/stores/auth-store";
import { useContactStore } from "@/stores/contact-store";
import { useTemplateStore } from "@/stores/template-store";
import { SubAddressHelper } from "@/components/identity/sub-address-helper";
import { generateSubAddress } from "@/lib/sub-addressing";
import { substitutePlaceholders } from "@/lib/template-utils";
import { TemplatePicker } from "@/components/templates/template-picker";
import { TemplateForm } from "@/components/templates/template-form";
import type { EmailTemplate } from "@/lib/template-types";

interface EmailComposerProps {
  onSend?: (data: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    draftId?: string;
    fromEmail?: string;
    fromName?: string;
    identityId?: string;
  }) => void | Promise<void>;
  onClose?: () => void;
  onDiscardDraft?: (draftId: string) => void;
  className?: string;
  initialDraftText?: string;
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
  initialDraftText,
  mode = 'compose',
  replyTo
}: EmailComposerProps) {
  const t = useTranslations('email_composer');
  const tCommon = useTranslations('common');
  const locale = useLocale();

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
      const fwdPrefix = t('prefix.forward');
      return `${fwdPrefix} ${replyTo.subject.replace(/^(Fwd:\s*|Tr:\s*)+/i, '')}`;
    } else if (mode === 'reply' || mode === 'replyAll') {
      const rePrefix = t('prefix.reply');
      return `${rePrefix} ${replyTo.subject.replace(/^(Re:\s*)+/i, '')}`;
    }
    return "";
  };

  const getInitialBody = () => {
    const prefix = initialDraftText || "";
    if (!replyTo?.body) return prefix;

    const date = replyTo.receivedAt ? new Date(replyTo.receivedAt).toLocaleString(locale) : "";
    const from = replyTo.from?.[0];
    const fromStr = from ? `${from.name || from.email}` : tCommon('unknown');

    if (mode === 'forward') {
      return `${prefix}\n\n---------- Forwarded message ----------\nFrom: ${fromStr}\nDate: ${date}\nSubject: ${replyTo.subject || ""}\n\n${replyTo.body}`;
    } else if (mode === 'reply' || mode === 'replyAll') {
      return `${prefix}\n\nOn ${date}, ${fromStr} wrote:\n> ${replyTo.body.split('\n').join('\n> ')}`;
    }
    return prefix;
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
  const [attachments, setAttachments] = useState<Array<{ file: File; blobId?: string; uploading?: boolean; error?: boolean; abortController?: AbortController }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationErrors, setValidationErrors] = useState<{ to?: boolean; subject?: boolean; body?: boolean }>({});
  const [shakeField, setShakeField] = useState<string | null>(null);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [subAddressTag, setSubAddressTag] = useState<string>('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const { dialogProps: confirmDialogProps, confirm } = useConfirmDialog();

  const saveTemplateModalRef = useFocusTrap({
    isActive: showSaveAsTemplate,
    onEscape: () => setShowSaveAsTemplate(false),
    restoreFocus: true,
  });

  const { client, identities, primaryIdentity } = useAuthStore();
  const getAutocomplete = useContactStore((s) => s.getAutocomplete);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const [autocompleteResults, setAutocompleteResults] = useState<Array<{ name: string; email: string }>>([]);
  const [activeAutoField, setActiveAutoField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [autoSelectedIndex, setAutoSelectedIndex] = useState(-1);
  const autocompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const ccInputRef = useRef<HTMLInputElement>(null);
  const bccInputRef = useRef<HTMLInputElement>(null);
  const toDropdownRef = useRef<HTMLDivElement>(null);
  const ccDropdownRef = useRef<HTMLDivElement>(null);
  const bccDropdownRef = useRef<HTMLDivElement>(null);

  const handleAutocomplete = useCallback((value: string, field: 'to' | 'cc' | 'bcc') => {
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }

    const lastPart = value.split(',').pop()?.trim() || '';
    if (lastPart.length < 1) {
      setAutocompleteResults([]);
      setActiveAutoField(null);
      setAutoSelectedIndex(-1);
      return;
    }

    autocompleteTimeoutRef.current = setTimeout(() => {
      const results = getAutocomplete(lastPart);
      setAutocompleteResults(results);
      setActiveAutoField(results.length > 0 ? field : null);
      setAutoSelectedIndex(-1);
    }, 200);
  }, [getAutocomplete]);

  const insertAutocomplete = (email: string, field: 'to' | 'cc' | 'bcc') => {
    const setter = field === 'to' ? setTo : field === 'cc' ? setCc : setBcc;
    const getter = field === 'to' ? to : field === 'cc' ? cc : bcc;

    const parts = getter.split(',');
    parts.pop();
    parts.push(` ${email}`);
    setter(parts.join(',').replace(/^,\s*/, ''));
    setAutocompleteResults([]);
    setActiveAutoField(null);
    setAutoSelectedIndex(-1);

    const ref = field === 'to' ? toInputRef : field === 'cc' ? ccInputRef : bccInputRef;
    ref.current?.focus();
  };

  const handleAutoBlur = useCallback((e: React.FocusEvent, field: 'to' | 'cc' | 'bcc') => {
    const dropdownRef = field === 'to' ? toDropdownRef : field === 'cc' ? ccDropdownRef : bccDropdownRef;
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && dropdownRef.current?.contains(relatedTarget)) {
      return;
    }
    if (activeAutoField === field) {
      setActiveAutoField(null);
      setAutoSelectedIndex(-1);
    }
  }, [activeAutoField]);

  const handleAutoKeyDown = (e: React.KeyboardEvent, field: 'to' | 'cc' | 'bcc') => {
    if (!activeAutoField || autocompleteResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutoSelectedIndex((prev) => Math.min(prev + 1, autocompleteResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutoSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && autoSelectedIndex >= 0) {
      e.preventDefault();
      insertAutocomplete(autocompleteResults[autoSelectedIndex].email, field);
    } else if (e.key === 'Escape') {
      setAutocompleteResults([]);
      setActiveAutoField(null);
      setAutoSelectedIndex(-1);
    }
  };

  const handleTemplateSelect = useCallback((template: EmailTemplate, filledValues: Record<string, string>) => {
    const filledSubject = Object.keys(filledValues).length > 0
      ? substitutePlaceholders(template.subject, filledValues)
      : template.subject;
    const filledBody = Object.keys(filledValues).length > 0
      ? substitutePlaceholders(template.body, filledValues)
      : template.body;

    if (mode === 'compose') {
      setSubject(filledSubject);
      setBody(filledBody);
      if (template.defaultRecipients?.to?.length) {
        setTo(template.defaultRecipients.to.join(', '));
      }
      if (template.defaultRecipients?.cc?.length) {
        setCc(template.defaultRecipients.cc.join(', '));
        setShowCc(true);
      }
      if (template.defaultRecipients?.bcc?.length) {
        setBcc(template.defaultRecipients.bcc.join(', '));
        setShowBcc(true);
      }
    } else {
      setBody((prev) => filledBody + prev);
    }

    if (template.identityId) {
      setSelectedIdentityId(template.identityId);
    }

    setShowTemplatePicker(false);
  }, [mode]);

  useEffect(() => {
    const handleTemplateKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowTemplatePicker(true);
      }
    };
    window.addEventListener('keydown', handleTemplateKey);
    return () => window.removeEventListener('keydown', handleTemplateKey);
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!client || !event.target.files) return;

    const files = Array.from(event.target.files);

    // AbortController tracks cancellation state but uploadBlob doesn't accept a signal,
    // so abort only prevents post-upload state updates (cosmetic cancellation)
    const newAttachments = files.map(file => {
      const controller = new AbortController();
      return { file, uploading: true, abortController: controller };
    });
    setAttachments(prev => [...prev, ...newAttachments]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const controller = newAttachments[i].abortController;
      try {
        if (controller?.signal.aborted) continue;
        const { blobId } = await client.uploadBlob(file);

        if (controller?.signal.aborted) continue;
        setAttachments(prev =>
          prev.map(att =>
            att.file === file
              ? { ...att, blobId, uploading: false, abortController: undefined }
              : att
          )
        );
      } catch (error) {
        if (controller?.signal.aborted) continue;
        debug.error(`Failed to upload ${file.name}:`, error);
        toast.error(t('upload_failed', { filename: file.name }));

        setAttachments(prev =>
          prev.map(att =>
            att.file === file
              ? { ...att, uploading: false, error: true, abortController: undefined }
              : att
          )
        );
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    const att = attachments[index];
    att?.abortController?.abort();
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-save draft functionality
  const saveDraft = async (): Promise<string | null> => {
    if (!client) return null;

    const toAddresses = to.split(",").map(e => e.trim()).filter(Boolean);
    const ccAddresses = cc.split(",").map(e => e.trim()).filter(Boolean);
    const bccAddresses = bcc.split(",").map(e => e.trim()).filter(Boolean);

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
    const currentData = JSON.stringify({ to: toAddresses, cc: ccAddresses, bcc: bccAddresses, subject, body, attachments: uploadedAttachments, identityId: selectedIdentityId, subAddressTag });

    // Only save if data has changed
    if (currentData === lastSavedDataRef.current) {
      return draftId;
    }

    setSaveStatus('saving');

    // Get the selected identity or primary identity
    const currentIdentity = selectedIdentityId
      ? identities.find(id => id.id === selectedIdentityId)
      : primaryIdentity;

    // Generate sub-addressed email if tag is set
    const fromEmail = currentIdentity?.email
      ? subAddressTag
        ? generateSubAddress(currentIdentity.email, subAddressTag)
        : currentIdentity.email
      : undefined;

    try {
      const savedDraftId = await client.createDraft(
        toAddresses,
        subject || t('no_subject'),
        body,
        ccAddresses,
        bccAddresses,
        currentIdentity?.id,
        fromEmail,
        draftId || undefined,
        uploadedAttachments,
        currentIdentity?.name || undefined
      );

      setDraftId(savedDraftId);
      lastSavedDataRef.current = currentData;
      setSaveStatus('saved');

      // Reset status after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);

      return savedDraftId;
    } catch {
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

  useEffect(() => {
    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
      }
    };
  }, []);

  const toAddresses = to.split(",").map(e => e.trim()).filter(Boolean);
  const hasContent = body || attachments.some(att => att.blobId && !att.uploading);
  const attachmentsBusy = attachments.some(att => att.uploading || att.error);
  const canSend = toAddresses.length > 0 && !!subject && hasContent && !attachmentsBusy;

  const getSendTooltip = (): string | undefined => {
    if (canSend) return undefined;
    if (toAddresses.length === 0) return t('validation.recipient_required');
    if (!subject) return t('validation.subject_required');
    if (!hasContent) return t('validation.body_required');
    if (attachmentsBusy) return t('validation.attachments_pending');
    return undefined;
  };

  const handleSend = async () => {
    const ccAddresses = cc.split(",").map(e => e.trim()).filter(Boolean);
    const bccAddresses = bcc.split(",").map(e => e.trim()).filter(Boolean);

    if (!canSend) {
      const errors: { to?: boolean; subject?: boolean; body?: boolean } = {};
      if (toAddresses.length === 0) errors.to = true;
      if (!subject) errors.subject = true;
      if (!hasContent) errors.body = true;
      setValidationErrors(errors);

      if (errors.to) {
        setShakeField('to');
        setTimeout(() => setShakeField(null), 400);
        toInputRef.current?.focus();
      }
      return;
    }

    let finalDraftId = draftId;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      try {
        const savedId = await saveDraft();
        if (savedId) {
          finalDraftId = savedId;
        }
      } catch (err) {
        debug.error('Failed to save draft before send:', err);
      }
    }

    const currentIdentity = selectedIdentityId
      ? identities.find(id => id.id === selectedIdentityId)
      : primaryIdentity;

    const fromEmail = currentIdentity?.email
      ? subAddressTag
        ? generateSubAddress(currentIdentity.email, subAddressTag)
        : currentIdentity.email
      : undefined;

    try {
      await onSend?.({
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject,
        body,
        draftId: finalDraftId || undefined,
        fromEmail,
        fromName: currentIdentity?.name || undefined,
        identityId: currentIdentity?.id,
      });

      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setDraftId(null);
      setSubAddressTag("");
      setValidationErrors({});
    } catch (err) {
      debug.error('Failed to send email:', err);
      toast.error(t('send_failed'));
    }
  };

  const handleClose = async () => {
    if (draftId && (to || subject || body)) {
      const confirmed = await confirm({
        title: t('discard_draft_title'),
        message: t('discard_draft_confirm'),
        confirmText: t('discard'),
        variant: "destructive",
      });

      if (confirmed) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

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
            <div className="flex-1 flex items-center gap-1">
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
                <span className="text-sm text-foreground flex-1">
                  {subAddressTag ? (
                    <span className="font-mono">
                      {generateSubAddress(primaryIdentity?.email || '', subAddressTag)}
                    </span>
                  ) : (
                    <>
                      {primaryIdentity?.name
                        ? `${primaryIdentity.name} <${primaryIdentity.email}>`
                        : primaryIdentity?.email || ''}
                    </>
                  )}
                </span>
              )}
              <SubAddressHelper
                baseEmail={
                  (selectedIdentityId
                    ? identities.find(id => id.id === selectedIdentityId)?.email
                    : primaryIdentity?.email) || ''
                }
                recipientEmails={to.split(',').map(e => e.trim()).filter(Boolean)}
                onSelectTag={setSubAddressTag}
              />
              {subAddressTag && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSubAddressTag('')}
                  className="h-6 px-2 text-xs"
                  title={t('remove_sub_address')}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          <div className={cn("flex items-center gap-2 relative", shakeField === 'to' && "animate-shake")}>
            <span className="text-sm text-muted-foreground w-16">{t('to')}:</span>
            <div className="flex-1 relative">
              <Input
                ref={toInputRef}
                type="email"
                placeholder={t('to_placeholder')}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  if (validationErrors.to) setValidationErrors(prev => ({ ...prev, to: false }));
                  handleAutocomplete(e.target.value, 'to');
                }}
                onKeyDown={(e) => handleAutoKeyDown(e, 'to')}
                onBlur={(e) => handleAutoBlur(e, 'to')}
                className={cn(
                  "border-0 focus-visible:ring-0",
                  validationErrors.to && "ring-2 ring-red-500 dark:ring-red-400"
                )}
                role="combobox"
                aria-expanded={activeAutoField === 'to' && autocompleteResults.length > 0}
                aria-autocomplete="list"
                aria-controls={activeAutoField === 'to' ? 'autocomplete-to' : undefined}
                aria-activedescendant={activeAutoField === 'to' && autoSelectedIndex >= 0 ? `autocomplete-option-${autoSelectedIndex}` : undefined}
                aria-invalid={validationErrors.to || undefined}
              />
              {validationErrors.to && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 px-1">{t('validation.recipient_required')}</p>
              )}
              {activeAutoField === 'to' && autocompleteResults.length > 0 && (
                <AutocompleteDropdown ref={toDropdownRef} id="autocomplete-to" results={autocompleteResults} selectedIndex={autoSelectedIndex} onSelect={(email) => insertAutocomplete(email, 'to')} />
              )}
            </div>
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
            <div className="flex items-center gap-2 relative">
              <span className="text-sm text-muted-foreground w-16">{t('cc_label')}</span>
              <div className="flex-1 relative">
                <Input
                  ref={ccInputRef}
                  type="email"
                  placeholder={t('cc_placeholder')}
                  value={cc}
                  onChange={(e) => {
                    setCc(e.target.value);
                    handleAutocomplete(e.target.value, 'cc');
                  }}
                  onKeyDown={(e) => handleAutoKeyDown(e, 'cc')}
                  onBlur={(e) => handleAutoBlur(e, 'cc')}
                  className="border-0 focus-visible:ring-0"
                  role="combobox"
                  aria-expanded={activeAutoField === 'cc' && autocompleteResults.length > 0}
                  aria-autocomplete="list"
                  aria-controls={activeAutoField === 'cc' ? 'autocomplete-cc' : undefined}
                  aria-activedescendant={activeAutoField === 'cc' && autoSelectedIndex >= 0 ? `autocomplete-option-${autoSelectedIndex}` : undefined}
                />
                {activeAutoField === 'cc' && autocompleteResults.length > 0 && (
                  <AutocompleteDropdown ref={ccDropdownRef} id="autocomplete-cc" results={autocompleteResults} selectedIndex={autoSelectedIndex} onSelect={(email) => insertAutocomplete(email, 'cc')} />
                )}
              </div>
            </div>
          )}

          {showBcc && (
            <div className="flex items-center gap-2 relative">
              <span className="text-sm text-muted-foreground w-16">{t('bcc_label')}</span>
              <div className="flex-1 relative">
                <Input
                  ref={bccInputRef}
                  type="email"
                  placeholder={t('bcc_placeholder')}
                  value={bcc}
                  onChange={(e) => {
                    setBcc(e.target.value);
                    handleAutocomplete(e.target.value, 'bcc');
                  }}
                  onKeyDown={(e) => handleAutoKeyDown(e, 'bcc')}
                  onBlur={(e) => handleAutoBlur(e, 'bcc')}
                  className="border-0 focus-visible:ring-0"
                  role="combobox"
                  aria-expanded={activeAutoField === 'bcc' && autocompleteResults.length > 0}
                  aria-autocomplete="list"
                  aria-controls={activeAutoField === 'bcc' ? 'autocomplete-bcc' : undefined}
                  aria-activedescendant={activeAutoField === 'bcc' && autoSelectedIndex >= 0 ? `autocomplete-option-${autoSelectedIndex}` : undefined}
                />
                {activeAutoField === 'bcc' && autocompleteResults.length > 0 && (
                  <AutocompleteDropdown ref={bccDropdownRef} id="autocomplete-bcc" results={autocompleteResults} selectedIndex={autoSelectedIndex} onSelect={(email) => insertAutocomplete(email, 'bcc')} />
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16">{t('subject_label')}</span>
            <Input
              type="text"
              placeholder={t('subject_placeholder')}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                if (validationErrors.subject) setValidationErrors(prev => ({ ...prev, subject: false }));
              }}
              className={cn(
                "flex-1 border-0 focus-visible:ring-0",
                validationErrors.subject && "ring-2 ring-red-500 dark:ring-red-400"
              )}
              aria-invalid={validationErrors.subject || undefined}
            />
          </div>
        </div>

        <div className="flex-1 px-4 py-3 min-h-0">
          <textarea
            className={cn(
              "w-full h-full resize-none outline-none text-sm bg-transparent text-foreground placeholder:text-muted-foreground rounded",
              validationErrors.body && "ring-2 ring-red-500 dark:ring-red-400"
            )}
            placeholder={t('body_placeholder')}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (validationErrors.body) setValidationErrors(prev => ({ ...prev, body: false }));
            }}
            aria-invalid={validationErrors.body || undefined}
          />
        </div>

        {attachments.length > 0 && (
          <div className="px-4 py-2 border-t">
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, index) => (
                <div
                  key={index}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm overflow-hidden",
                    att.error ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-foreground"
                  )}
                >
                  {att.uploading && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="h-full bg-primary/10 animate-pulse" />
                      <div className="absolute bottom-0 left-0 h-0.5 bg-primary/40 animate-[indeterminate_1.5s_ease-in-out_infinite]" style={{ width: '40%' }} />
                    </div>
                  )}
                  <div className="relative flex items-center gap-2">
                    {att.uploading ? (
                      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    ) : att.error ? (
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <Paperclip className="w-3 h-3 flex-shrink-0" />
                    )}
                    <span className="max-w-[200px] truncate">{att.file.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      ({formatFileSize(att.file.size)})
                    </span>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="ml-1 hover:text-red-500 min-w-[20px] min-h-[20px] flex items-center justify-center"
                      title={att.uploading ? t('upload_cancel') : undefined}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
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

          {/* Right side - Template, Save as Template, Attach and Send */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplatePicker(true)}
              title={t('use_template')}
            >
              <FileText className="w-4 h-4 mr-2" />
              {t('use_template')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSaveAsTemplate(true)}
              title={t('save_as_template')}
            >
              <BookmarkPlus className="w-4 h-4" />
            </Button>
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
            <Button
              onClick={handleSend}
              disabled={!canSend}
              title={getSendTooltip()}
            >
              <Send className="w-4 h-4 mr-2" />
              {t('send')}
            </Button>
          </div>
        </div>
      </div>

      {showTemplatePicker && (
        <TemplatePicker
          isOpen={showTemplatePicker}
          onClose={() => setShowTemplatePicker(false)}
          onSelect={handleTemplateSelect}
        />
      )}

      {showSaveAsTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div
            ref={saveTemplateModalRef}
            role="dialog"
            aria-modal="true"
            className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">{t('save_as_template')}</h3>
            <TemplateForm
              initialData={{
                subject,
                body,
                to: to.split(',').map(s => s.trim()).filter(Boolean),
                cc: cc.split(',').map(s => s.trim()).filter(Boolean),
                bcc: bcc.split(',').map(s => s.trim()).filter(Boolean),
              }}
              onSave={(data) => {
                addTemplate(data);
                setShowSaveAsTemplate(false);
              }}
              onCancel={() => setShowSaveAsTemplate(false)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}

const AutocompleteDropdown = React.forwardRef<HTMLDivElement, {
  id: string;
  results: Array<{ name: string; email: string }>;
  selectedIndex: number;
  onSelect: (email: string) => void;
}>(function AutocompleteDropdown({ id, results, selectedIndex, onSelect }, ref) {
  return (
    <div ref={ref} id={id} role="listbox" className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
      {results.map((r, i) => (
        <button
          key={i}
          id={`autocomplete-option-${i}`}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          className={cn(
            "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
            i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(r.email);
          }}
        >
          <span className="font-medium truncate">{r.name || r.email}</span>
          {r.name && (
            <span className="text-muted-foreground truncate">&lt;{r.email}&gt;</span>
          )}
        </button>
      ))}
    </div>
  );
});