"use client";

import { useMemo, useState, useCallback, type DragEvent } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday, format, parseISO, getWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { EventCard } from "./event-card";
import { getEventEndDate, getEventLastVisibleDate } from "@/lib/calendar-utils";
import type { CalendarEvent, Calendar } from "@/lib/jmap/types";
import { useAuthStore } from "@/stores/auth-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { toast } from "@/stores/toast-store";

interface CalendarMonthViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onSelectDate: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  onCreateAtTime: (date: Date, endDate?: Date) => void;
  firstDayOfWeek?: number;
}

export function CalendarMonthView({
  selectedDate,
  events,
  calendars,
  onSelectDate,
  onSelectEvent,
  onCreateAtTime,
  firstDayOfWeek = 1,
}: CalendarMonthViewProps) {
  const t = useTranslations("calendar");
  const intlFormatter = useFormatter();
  const weekStart = (firstDayOfWeek === 0 ? 0 : 1) as 0 | 1;
  const firstWeekContainsDate = weekStart === 1 ? 4 : 1;

  const days = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: weekStart });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: weekStart });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [selectedDate, weekStart]);

  const calendarMap = useMemo(() => {
    const map = new Map<string, Calendar>();
    calendars.forEach((c) => map.set(c.id, c));
    return map;
  }, [calendars]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      try {
        const start = new Date(e.start);
        const end = getEventLastVisibleDate(e);
        const startDay = new Date(start);
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(end);
        endDay.setHours(0, 0, 0, 0);

        const cursor = new Date(startDay);
        while (cursor <= endDay) {
          const key = format(cursor, "yyyy-MM-dd");
          const arr = map.get(key) || [];
          arr.push(e);
          map.set(key, arr);
          cursor.setDate(cursor.getDate() + 1);
        }
      } catch { /* skip invalid dates */ }
    });
    return map;
  }, [events]);

  const dayHeaders = firstDayOfWeek === 0
    ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
    : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const [dropDayKey, setDropDayKey] = useState<string | null>(null);

  // Round up to the next whole hour, keeping exact-hour times unchanged.
  const getRoundedUpHour = useCallback((date: Date): number => {
    const rounded = new Date(date);
    if (
      rounded.getMinutes() > 0 ||
      rounded.getSeconds() > 0 ||
      rounded.getMilliseconds() > 0
    ) {
      rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
    } else {
      rounded.setMinutes(0, 0, 0);
    }
    return rounded.getHours();
  }, []);

  // Build busy minute ranges for this specific day, clipped to day boundaries.
  const getBusyIntervalsForDay = useCallback((day: Date, dayEvents: CalendarEvent[]) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const intervals: Array<[number, number]> = [];
    for (const ev of dayEvents) {
      if (ev.showWithoutTime) continue;
      const evStart = new Date(ev.start);
      const evEnd = getEventEndDate(ev);
      if (evEnd <= dayStart || evStart >= dayEnd) continue;

      const clippedStart = evStart < dayStart ? dayStart : evStart;
      const clippedEnd = evEnd > dayEnd ? dayEnd : evEnd;
      const startMin = Math.max(0, Math.floor((clippedStart.getTime() - dayStart.getTime()) / 60000));
      const endMin = Math.min(24 * 60, Math.ceil((clippedEnd.getTime() - dayStart.getTime()) / 60000));
      if (endMin > startMin) intervals.push([startMin, endMin]);
    }
    return intervals;
  }, []);

  // Pick the first free 1-hour slot; fallback to the next whole hour when fully occupied.
  const findSuggestedStart = useCallback((day: Date, dayEvents: CalendarEvent[]) => {
    const now = new Date();
    const startHour = isToday(day) ? getRoundedUpHour(now) : 9;
    const fallbackHour = isToday(day) ? getRoundedUpHour(now) : 9;
    const busyIntervals = getBusyIntervalsForDay(day, dayEvents);

    const isSlotFree = (hour: number) => {
      const startMin = hour * 60;
      const endMin = startMin + 60;
      return busyIntervals.every(([busyStart, busyEnd]) => endMin <= busyStart || startMin >= busyEnd);
    };

    for (let hour = Math.max(0, startHour); hour < 24; hour++) {
      if (isSlotFree(hour)) {
        const start = new Date(day);
        start.setHours(hour, 0, 0, 0);
        return start;
      }
    }

    const fallback = new Date(day);
    fallback.setHours(Math.min(23, Math.max(0, fallbackHour)), 0, 0, 0);
    return fallback;
  }, [getBusyIntervalsForDay, getRoundedUpHour]);

  const handleCellDragOver = useCallback((e: DragEvent<HTMLDivElement>, dayKey: string) => {
    if (!e.dataTransfer.types.includes("application/x-calendar-event")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropDayKey((prev) => prev === dayKey ? prev : dayKey);
  }, []);

  const handleCellDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(related)) setDropDayKey(null);
  }, []);

  const handleCellDrop = useCallback(async (e: DragEvent<HTMLDivElement>, day: Date) => {
    e.preventDefault();
    setDropDayKey(null);
    const json = e.dataTransfer.getData("application/x-calendar-event");
    if (!json) return;
    try {
      const data = JSON.parse(json);
      const originalStart = parseISO(data.originalStart);
      const newStart = new Date(day);
      newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), 0);
      const newStartISO = format(newStart, "yyyy-MM-dd'T'HH:mm:ss");
      if (newStartISO === data.originalStart) return;
      const client = useAuthStore.getState().client;
      if (!client) return;
      const event = useCalendarStore.getState().events.find(e => e.id === data.eventId);
      const hasParticipants = event?.participants && Object.keys(event.participants).length > 0;
      await useCalendarStore.getState().updateEvent(client, data.eventId, { start: newStartISO }, hasParticipants || undefined);
    } catch {
      toast.error(t("notifications.event_move_error"));
    }
  }, [t]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden" role="grid" aria-label={intlFormatter.dateTime(selectedDate, { month: "long", year: "numeric" })}>
      <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] border-b border-border" role="row">
        {dayHeaders.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="text-center text-xs font-medium text-muted-foreground py-2 border-r border-border last:border-r-0 first:col-start-2"
          >
            {t(`days.${d}`)}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] flex-1 min-h-[100px] border-b border-border last:border-b-0" role="row">
            <div className="border-r border-border bg-muted/30 px-1 py-1 flex items-start justify-center">
              <span className="text-[10px] text-muted-foreground font-medium leading-5">
                {getWeek(week[0], { weekStartsOn: weekStart, firstWeekContainsDate })}
              </span>
            </div>
            {week.map((day) => {
              const inMonth = isSameMonth(day, selectedDate);
              const selected = isSameDay(day, selectedDate);
              const today = isToday(day);
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDate.get(key) || [];
              const maxVisible = 3;
              const fullDateLabel = intlFormatter.dateTime(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={fullDateLabel}
                  onClick={() => {
                    onSelectDate(day);
                  }}
                  onDoubleClick={() => {
                    onSelectDate(day);
                    const suggestedStart = findSuggestedStart(day, dayEvents);
                    const suggestedEnd = new Date(suggestedStart);
                    suggestedEnd.setHours(suggestedEnd.getHours() + 1);
                    onCreateAtTime(suggestedStart, suggestedEnd);
                  }}
                  onDragOver={(e) => handleCellDragOver(e, key)}
                  onDragLeave={handleCellDragLeave}
                  onDrop={(e) => handleCellDrop(e, day)}
                  className={cn(
                    "border-r border-border last:border-r-0 p-1 cursor-pointer transition-colors",
                    !inMonth && "bg-muted/30",
                    "hover:bg-muted/50",
                    dropDayKey === key && "ring-2 ring-inset ring-primary bg-primary/10"
                  )}
                >
                  <div className="flex items-center justify-center mb-0.5">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-6 text-xs rounded-full",
                        today && !selected && "bg-primary text-primary-foreground font-bold",
                        selected && "bg-primary text-primary-foreground font-bold",
                        !inMonth && !selected && !today && "text-muted-foreground/50",
                        inMonth && !selected && !today && "font-medium"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, maxVisible).map((ev) => {
                      const calId = Object.keys(ev.calendarIds)[0];
                      return (
                        <EventCard
                          key={ev.id}
                          event={ev}
                          calendar={calendarMap.get(calId)}
                          variant="chip"
                          onClick={(rect) => onSelectEvent(ev, rect)}
                          draggable
                        />
                      );
                    })}
                    {dayEvents.length > maxVisible && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        {t("events.more", { count: dayEvents.length - maxVisible })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
