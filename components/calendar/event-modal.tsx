"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { X, Trash2, Check, Users, CalendarDays, Copy } from "lucide-react";
import { format, parseISO, addHours, addDays } from "date-fns";
import type { CalendarEvent, Calendar, CalendarParticipant } from "@/lib/jmap/types";
import { parseDuration } from "./event-card";
import { getEventLastVisibleDate } from "@/lib/calendar-utils";
import { ParticipantInput } from "./participant-input";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import {
  isOrganizer,
  getUserParticipantId,
  getUserStatus,
  getParticipantList,
  getStatusCounts,
  buildParticipantMap,
} from "@/lib/calendar-participants";

interface EventModalProps {
  event?: CalendarEvent | null;
  calendars: Calendar[];
  defaultDate?: Date;
  defaultEndDate?: Date;
  onSave: (data: Partial<CalendarEvent>, sendSchedulingMessages?: boolean) => void;
  onDelete?: (id: string, sendSchedulingMessages?: boolean) => void;
  onDuplicate?: (data: Partial<CalendarEvent>) => void;
  onRsvp?: (eventId: string, participantId: string, status: CalendarParticipant['participationStatus']) => void;
  onClose: () => void;
  currentUserEmails?: string[];
}

function formatDateInput(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function formatTimeInput(d: Date): string {
  return format(d, "HH:mm");
}

function buildDuration(startDate: Date, endDate: Date): string {
  const diffMs = endDate.getTime() - startDate.getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  let dur = "P";
  if (days > 0) dur += `${days}D`;
  dur += "T";
  if (hours > 0) dur += `${hours}H`;
  if (minutes > 0) dur += `${minutes}M`;
  if (dur === "PT") dur = "PT0M";
  return dur;
}

type RecurrenceOption = "none" | "daily" | "weekly" | "monthly" | "yearly";
type AlertOption = "none" | "at_time" | "5" | "15" | "30" | "60" | "1440";

// Build an RFC5545-style UID (`id@domain`) using organizer email domain when available.
function generateUid(seedEmail?: string): string {
  const domainFromEmail = seedEmail?.includes("@") ? seedEmail.split("@")[1] : "";
  const host = (typeof window !== "undefined" && window.location.hostname) ? window.location.hostname : "";
  const domain = domainFromEmail || host || "localhost";
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${id}@${domain}`;
}

export function EventModal({
  event,
  calendars,
  defaultDate,
  defaultEndDate,
  onSave,
  onDelete,
  onDuplicate,
  onRsvp,
  onClose,
  currentUserEmails = [],
}: EventModalProps) {
  const t = useTranslations("calendar");
  const isEdit = !!event;
  const { dialogProps: confirmDialogProps, confirm } = useConfirmDialog();

  const userIsOrganizer = useMemo(() => {
    if (!event) return true;
    if (!event.participants) return true;
    return isOrganizer(event, currentUserEmails);
  }, [event, currentUserEmails]);

  const isAttendeeMode = useMemo(() => {
    if (!event || !event.participants) return false;
    return !event.isOrigin && !userIsOrganizer;
  }, [event, userIsOrganizer]);

  const userParticipantId = useMemo(() => {
    if (!event) return null;
    return getUserParticipantId(event, currentUserEmails);
  }, [event, currentUserEmails]);

  const userCurrentStatus = useMemo(() => {
    if (!event) return null;
    return getUserStatus(event, currentUserEmails);
  }, [event, currentUserEmails]);

  const existingParticipants = useMemo(() => {
    if (!event) return [];
    return getParticipantList(event);
  }, [event]);

  const organizerInfo = useMemo(() => {
    if (!event?.participants) return null;
    const organizer = existingParticipants.find(p => p.isOrganizer);
    return organizer ? { name: organizer.name, email: organizer.email } : null;
  }, [event, existingParticipants]);

  const getInitialStart = (): Date => {
    if (event?.start) return parseISO(event.start);
    if (defaultDate) {
      const d = new Date(defaultDate);
      if (defaultEndDate) return d;
      const now = new Date();
      d.setHours(now.getHours() + 1, 0, 0, 0);
      return d;
    }
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  };

  const getInitialEnd = (): Date => {
    if (event?.start) {
      if (event.showWithoutTime) return getEventLastVisibleDate(event);
      const s = parseISO(event.start);
      const dur = parseDuration(event.duration);
      return new Date(s.getTime() + dur * 60000);
    }
    if (defaultEndDate) return new Date(defaultEndDate);
    return addHours(getInitialStart(), 1);
  };

  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [location, setLocation] = useState(
    event?.locations ? Object.values(event.locations)[0]?.name || "" : ""
  );
  const [startDate, setStartDate] = useState(formatDateInput(getInitialStart()));
  const [startTime, setStartTime] = useState(formatTimeInput(getInitialStart()));
  const [endDate, setEndDate] = useState(formatDateInput(getInitialEnd()));
  const [endTime, setEndTime] = useState(formatTimeInput(getInitialEnd()));
  const [allDay, setAllDay] = useState(event?.showWithoutTime || false);
  const [calendarId, setCalendarId] = useState<string>(() => {
    if (event?.calendarIds) return Object.keys(event.calendarIds)[0] || calendars[0]?.id || "";
    const defaultCal = calendars.find(c => c.isDefault);
    return defaultCal?.id || calendars[0]?.id || "";
  });
  const [recurrence, setRecurrence] = useState<RecurrenceOption>(() => {
    if (!event?.recurrenceRules?.length) return "none";
    return event.recurrenceRules[0].frequency as RecurrenceOption;
  });
  const [alert, setAlert] = useState<AlertOption>(() => {
    if (!event?.alerts) return "none";
    const first = Object.values(event.alerts)[0];
    if (!first) return "none";
    if (first.trigger["@type"] === "OffsetTrigger") {
      const offset = first.trigger.offset;
      if (offset === "PT0S") return "at_time";
      const minMatch = offset.match(/-?PT?(\d+)M$/);
      if (minMatch) return minMatch[1] as AlertOption;
      const hourMatch = offset.match(/-?PT?(\d+)H$/);
      if (hourMatch) return String(parseInt(hourMatch[1]) * 60) as AlertOption;
      const dayMatch = offset.match(/-?P(\d+)D/);
      if (dayMatch) return String(parseInt(dayMatch[1]) * 1440) as AlertOption;
    }
    return "none";
  });
  const [attendees, setAttendees] = useState<{ name: string; email: string }[]>(() => {
    if (!event?.participants) return [];
    const ownEmails = new Set(currentUserEmails.map(e => e.toLowerCase()));
    return existingParticipants
      .filter(p => !p.isOrganizer && p.email && !ownEmails.has(p.email.toLowerCase()))
      .map(p => ({ name: p.name, email: p.email }));
  });
  const [sendInvitations, setSendInvitations] = useState(true);

  const statusCounts = useMemo(() => {
    if (!event?.participants) return null;
    return getStatusCounts(event);
  }, [event]);

  const handleAddAttendee = useCallback((p: { name: string; email: string }) => {
    const email = p.email.trim().toLowerCase();
    if (!email) return;
    if (currentUserEmails.some(e => e.toLowerCase() === email)) return;
    setAttendees(prev => [...prev, p]);
  }, [currentUserEmails]);

  const handleRemoveAttendee = useCallback((email: string) => {
    setAttendees(prev => prev.filter(a => a.email.toLowerCase() !== email.toLowerCase()));
  }, []);

  const handleSave = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    if (trimmedTitle.length > 500 || description.trim().length > 10000 || location.trim().length > 500) return;

    const startStr = allDay
      ? `${startDate}T00:00:00`
      : `${startDate}T${startTime}:00`;
    const endStr = allDay
      ? `${endDate}T23:59:59`
      : `${endDate}T${endTime}:00`;

    const start = new Date(startStr);
    let end = new Date(endStr);

    if (end <= start) {
      end = new Date(start.getTime() + 3600000);
    }

    const duration = allDay
      ? `P${Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))}D`
      : buildDuration(start, end);

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const data: Partial<CalendarEvent> = {
      "@type": "Event",
      title: trimmedTitle,
      description: description.trim(),
      start: startStr,
      duration,
      timeZone,
      showWithoutTime: allDay,
      calendarIds: { [calendarId]: true },
      status: "confirmed",
      freeBusyStatus: "busy",
      privacy: "public",
    };

    if (!event?.uid) {
      const seed = currentUserEmails[0] || existingParticipants.find(p => p.isOrganizer)?.email;
      data.uid = generateUid(seed);
    }

    if (location.trim()) {
      data.locations = {
        loc1: {
          "@type": "Location",
          name: location.trim(),
          description: null,
          locationTypes: null,
          coordinates: null,
          timeZone: null,
          links: null,
          relativeTo: null,
        },
      };
    } else if (event && event.locations && Object.keys(event.locations).length > 0) {
      data.locations = null;
    }

    if (recurrence !== "none") {
      data.recurrenceRules = [{
        "@type": "RecurrenceRule",
        frequency: recurrence,
        interval: 1,
        rscale: "gregorian",
        skip: "omit",
        firstDayOfWeek: "mo",
        byDay: null,
        byMonthDay: null,
        byMonth: null,
        byYearDay: null,
        byWeekNo: null,
        byHour: null,
        byMinute: null,
        bySecond: null,
        bySetPosition: null,
        count: null,
        until: null,
      }];
    } else if (event && event.recurrenceRules?.length) {
      data.recurrenceRules = null;
      if (event.recurrenceOverrides) data.recurrenceOverrides = null;
      if (event.excludedRecurrenceRules) data.excludedRecurrenceRules = null;
    }

    if (alert !== "none") {
      const offset = alert === "at_time" ? "PT0S" : `-PT${alert}M`;
      data.alerts = {
        alert1: {
          "@type": "Alert",
          trigger: { "@type": "OffsetTrigger", offset, relativeTo: "start" },
          action: "display",
          acknowledged: null,
          relatedTo: null,
        },
      };
    } else if (event && event.alerts && Object.keys(event.alerts).length > 0) {
      data.alerts = null;
    }

    const ownEmails = new Set(currentUserEmails.map(e => e.toLowerCase()));
    const existingOrganizer = existingParticipants.find(p => p.isOrganizer);
    const organizerEmail = (currentUserEmails[0] || existingOrganizer?.email || "").toLowerCase();
    const invitees = attendees.filter((a) => {
      const email = a.email?.toLowerCase();
      if (!email) return false;
      if (ownEmails.has(email)) return false;
      if (organizerEmail && email === organizerEmail) return false;
      return true;
    });

    if (invitees.length > 0) {
      const organizerName = existingOrganizer?.name || "";
      const organizerCalendarAddress = organizerEmail ? `mailto:${organizerEmail}` : null;

      data.participants = buildParticipantMap(
        organizerEmail ? { name: organizerName, email: organizerEmail } : null,
        invitees
      ) as Record<string, CalendarParticipant>;
      data.organizerCalendarAddress = organizerCalendarAddress;
    } else if (attendees.length === 0 && event?.participants) {
      data.participants = null;
      data.organizerCalendarAddress = null;
    }

    const shouldSendScheduling = invitees.length > 0 && sendInvitations;
    onSave(data, shouldSendScheduling);
  }, [title, description, location, startDate, startTime, endDate, endTime, allDay, calendarId, recurrence, alert, attendees, sendInvitations, currentUserEmails, existingParticipants, event, onSave]);

  const handleRsvp = useCallback((status: CalendarParticipant['participationStatus']) => {
    if (!event || !userParticipantId || !onRsvp) return;
    onRsvp(event.id, userParticipantId, status);
    onClose();
  }, [event, userParticipantId, onRsvp, onClose]);

  const handleDuplicate = useCallback(() => {
    if (!event || !onDuplicate) return;
    const start = parseISO(event.start);
    const newStart = addDays(start, 1);
    const data: Partial<CalendarEvent> = {
      title: event.title,
      description: event.description,
      start: format(newStart, "yyyy-MM-dd'T'HH:mm:ss"),
      duration: event.duration,
      timeZone: event.timeZone,
      showWithoutTime: event.showWithoutTime,
      calendarIds: { ...event.calendarIds },
      status: "confirmed",
      freeBusyStatus: event.freeBusyStatus,
      privacy: event.privacy,
    };
    if (event.locations) data.locations = structuredClone(event.locations);
    if (event.recurrenceRules) data.recurrenceRules = structuredClone(event.recurrenceRules);
    if (event.alerts) data.alerts = structuredClone(event.alerts);
    if (event.participants) data.participants = structuredClone(event.participants);
    onDuplicate(data);
  }, [event, onDuplicate]);

  const hasParticipants = attendees.length > 0 || (event?.participants && Object.keys(event.participants).length > 0);

  const handleDelete = useCallback(async () => {
    if (!event || !onDelete) return;
    const deleteMessage = hasParticipants
      ? `${t("form.delete_confirm")} ${t("participants.cancel_notification")}`
      : t("form.delete_confirm");

    const confirmed = await confirm({
      title: t("detail.delete_confirm"),
      message: deleteMessage,
      confirmText: t("events.delete"),
      cancelText: t("form.cancel"),
      variant: "destructive",
    });

    if (!confirmed) return;

    onDelete(event.id, hasParticipants || undefined);
    onClose();
  }, [confirm, event, hasParticipants, onClose, onDelete, t]);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isAttendeeMode) handleSave();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handleSave, isAttendeeMode]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusableEls = modal.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    );
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl?.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl?.focus();
      }
    };
    modal.addEventListener("keydown", handler);
    firstEl?.focus();
    return () => modal.removeEventListener("keydown", handler);
  }, []);

  if (isAttendeeMode && event) {
    const startD = parseISO(event.start);
    const durMin = parseDuration(event.duration);
    const endD = new Date(startD.getTime() + durMin * 60000);
    const locationName = event.locations ? Object.values(event.locations)[0]?.name : null;
    const participants = getParticipantList(event);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
        <div ref={modalRef} role="dialog" aria-modal="true" aria-label={event.title || t("events.no_title")} className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold truncate">{event.title || t("events.no_title")}</h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0 mt-0.5" aria-label={t("form.cancel")}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-4 py-3">
              <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-200">
                  {t("participants.invited_by", { name: organizerInfo?.name || organizerInfo?.email || t("participants.organizer") })}
                </p>
                <p className="text-blue-700 dark:text-blue-400 mt-0.5">
                  {t("participants.respond_below")}
                </p>
              </div>
            </div>

            <div className="text-sm">
              <span className="font-medium">{format(startD, "EEE, MMM d, yyyy")}</span>
              {!event.showWithoutTime && (
                <span className="text-muted-foreground ml-2">
                  {format(startD, "HH:mm")} – {format(endD, "HH:mm")}
                </span>
              )}
            </div>

            {event.description && (
              <p className="text-sm text-muted-foreground">{event.description}</p>
            )}

            {locationName && (
              <p className="text-sm text-muted-foreground">{locationName}</p>
            )}

            {participants.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Users className="w-4 h-4" />
                  {t("participants.title")}
                </div>
                <div className="space-y-1 pl-5">
                  {participants.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{p.name || p.email}</span>
                      <StatusBadge status={p.status} isOrganizer={p.isOrganizer} t={t} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("participants.rsvp_label")}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={userCurrentStatus === "accepted" ? "default" : "outline"}
                  onClick={() => handleRsvp("accepted")}
                  className={userCurrentStatus === "accepted"
                    ? "bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600"
                    : "text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950"}
                >
                  {userCurrentStatus === "accepted" && <Check className="w-4 h-4 mr-1" />}
                  {t("participants.accepted")}
                </Button>
                <Button
                  size="sm"
                  variant={userCurrentStatus === "tentative" ? "default" : "outline"}
                  onClick={() => handleRsvp("tentative")}
                  className={userCurrentStatus === "tentative"
                    ? "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
                    : "border border-amber-500 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"}
                >
                  {userCurrentStatus === "tentative" && <Check className="w-4 h-4 mr-1" />}
                  {t("participants.tentative")}
                </Button>
                <Button
                  size="sm"
                  variant={userCurrentStatus === "declined" ? "default" : "ghost"}
                  onClick={() => handleRsvp("declined")}
                  className={userCurrentStatus === "declined"
                    ? "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600"
                    : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"}
                >
                  {userCurrentStatus === "declined" && <Check className="w-4 h-4 mr-1" />}
                  {t("participants.declined")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={isEdit ? t("events.edit") : t("events.create")} className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {isEdit ? t("events.edit") : t("events.create")}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0 mt-0.5" aria-label={t("form.cancel")}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">{t("form.title")}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("form.title")}
              maxLength={500}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t("form.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("form.description")}
              rows={3}
              maxLength={10000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">{t("form.location")}</label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("form.location")}
              maxLength={500}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {t("participants.title")}
              </span>
            </label>
            <ParticipantInput
              participants={attendees}
              onAdd={handleAddAttendee}
              onRemove={handleRemoveAttendee}
            />
            {isEdit && statusCounts && (existingParticipants.length > 0) && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {t("participants.status_summary", {
                  accepted: statusCounts.accepted,
                  pending: statusCounts.tentative + statusCounts['needs-action'],
                })}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-input"
            />
            <label htmlFor="allDay" className="text-sm">{t("form.all_day_event")}</label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">{t("form.start_date")}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {!allDay && (
              <div>
                <label className="text-sm font-medium mb-1 block">{t("form.start_time")}</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">{t("form.end_date")}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {!allDay && (
              <div>
                <label className="text-sm font-medium mb-1 block">{t("form.end_time")}</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          {calendars.length > 1 && (
            <div>
              <label className="text-sm font-medium mb-1 block">{t("form.calendar_select")}</label>
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">{t("recurrence.title")}</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceOption)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="none">{t("recurrence.none")}</option>
                <option value="daily">{t("recurrence.daily")}</option>
                <option value="weekly">{t("recurrence.weekly")}</option>
                <option value="monthly">{t("recurrence.monthly")}</option>
                <option value="yearly">{t("recurrence.yearly")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t("alerts.title")}</label>
              <select
                value={alert}
                onChange={(e) => setAlert(e.target.value as AlertOption)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="none">{t("alerts.none")}</option>
                <option value="at_time">{t("alerts.at_time")}</option>
                <option value="5">{t("alerts.minutes_before", { count: 5 })}</option>
                <option value="15">{t("alerts.minutes_before", { count: 15 })}</option>
                <option value="30">{t("alerts.minutes_before", { count: 30 })}</option>
                <option value="60">{t("alerts.hours_before", { count: 1 })}</option>
                <option value="1440">{t("alerts.days_before", { count: 1 })}</option>
              </select>
            </div>
          </div>

          {attendees.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sendInvitations"
                checked={sendInvitations}
                onChange={(e) => setSendInvitations(e.target.checked)}
                className="rounded border-input"
              />
              <label htmlFor="sendInvitations" className="text-sm">
                {t("participants.send_invitations")}
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div className="flex items-center gap-1">
            {isEdit && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {t("events.delete")}
              </Button>
            )}
            {isEdit && onDuplicate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDuplicate}
                aria-label={t("events.duplicate")}
              >
                <Copy className="w-4 h-4 mr-1" />
                {t("events.duplicate")}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!title.trim()}>
              {t("form.save")}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}

function StatusBadge({ status, isOrganizer, t }: {
  status: CalendarParticipant['participationStatus'];
  isOrganizer: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  if (isOrganizer) {
    return <span className="text-xs text-primary">{t("participants.organizer")}</span>;
  }
  const colors: Record<string, string> = {
    accepted: "text-green-600 dark:text-green-400",
    declined: "text-red-600 dark:text-red-400",
    tentative: "text-amber-600 dark:text-amber-400",
    "needs-action": "text-muted-foreground",
  };
  const labels: Record<string, string> = {
    accepted: "participants.accepted",
    declined: "participants.declined",
    tentative: "participants.tentative",
    "needs-action": "participants.needs_action",
  };
  return <span className={`text-xs ${colors[status] || ""}`}>{t(labels[status] || labels["needs-action"])}</span>;
}
