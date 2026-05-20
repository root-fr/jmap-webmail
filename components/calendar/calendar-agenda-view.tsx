"use client";

import { useMemo } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { Calendar as CalendarIcon, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDuration, getEventColor } from "./event-card";
import { getEventLastVisibleDate } from "@/lib/calendar-utils";
import { getParticipantCount } from "@/lib/calendar-participants";
import type { CalendarEvent, Calendar } from "@/lib/jmap/types";

interface CalendarAgendaViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  timeFormat?: "12h" | "24h";
}

interface DayGroup {
  date: Date;
  dateKey: string;
  events: CalendarEvent[];
}

export function CalendarAgendaView({
  events,
  calendars,
  onSelectEvent,
  timeFormat = "24h",
}: CalendarAgendaViewProps) {
  const t = useTranslations("calendar");
  const intlFormatter = useFormatter();

  const calendarMap = useMemo(() => {
    const map = new Map<string, Calendar>();
    calendars.forEach((c) => map.set(c.id, c));
    return map;
  }, [calendars]);

  const grouped = useMemo(() => {
    const sorted = [...events].sort((a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    const groups: DayGroup[] = [];
    const groupMap = new Map<string, DayGroup>();

    sorted.forEach((ev) => {
      try {
        const start = new Date(ev.start);
        const end = getEventLastVisibleDate(ev);
        const startKey = format(start, "yyyy-MM-dd");
        const endKey = format(end, "yyyy-MM-dd");

        if (startKey === endKey || ev.showWithoutTime) {
          let group = groupMap.get(startKey);
          if (!group) {
            group = { date: start, dateKey: startKey, events: [] };
            groupMap.set(startKey, group);
            groups.push(group);
          }
          group.events.push(ev);
        } else {
          const cursor = new Date(start);
          cursor.setHours(0, 0, 0, 0);
          const endDay = new Date(end);
          endDay.setHours(0, 0, 0, 0);
          while (cursor <= endDay) {
            const key = format(cursor, "yyyy-MM-dd");
            let group = groupMap.get(key);
            if (!group) {
              group = { date: new Date(cursor), dateKey: key, events: [] };
              groupMap.set(key, group);
              groups.push(group);
            }
            group.events.push(ev);
            cursor.setDate(cursor.getDate() + 1);
          }
        }
      } catch { /* skip invalid dates */ }
    });

    groups.sort((a, b) => a.date.getTime() - b.date.getTime());
    return groups;
  }, [events]);

  const formatDateHeader = (date: Date): string => {
    if (isToday(date)) return t("events.today_header");
    if (isTomorrow(date)) return t("events.tomorrow_header");
    return intlFormatter.dateTime(date, { weekday: "long", month: "long", day: "numeric" });
  };

  const formatTime = (date: Date): string => {
    if (timeFormat === "12h") {
      return intlFormatter.dateTime(date, { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return format(date, "HH:mm");
  };

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
        <CalendarIcon className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">{t("events.no_events")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {grouped.map((group) => (
        <div key={group.dateKey}>
          <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b border-border">
            <span className={cn(
              "text-sm font-medium",
              isToday(group.date) && "text-primary"
            )}>
              {formatDateHeader(group.date)}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {intlFormatter.dateTime(group.date, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <div className="divide-y divide-border">
            {group.events.map((ev) => {
              const calId = Object.keys(ev.calendarIds)[0];
              const calendar = calendarMap.get(calId);
              const color = getEventColor(ev, calendar);
              const start = parseISO(ev.start);
              const durMin = parseDuration(ev.duration);
              const end = new Date(start.getTime() + durMin * 60000);
              const locationName = ev.locations
                ? Object.values(ev.locations)[0]?.name
                : null;

              return (
                <button
                  key={ev.id}
                  onClick={(e) => onSelectEvent(ev, e.currentTarget.getBoundingClientRect())}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex flex-col items-center pt-0.5 min-w-[60px]">
                    {ev.showWithoutTime ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("events.all_day")}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm font-medium">{formatTime(start)}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(end)}</span>
                      </>
                    )}
                  </div>

                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {ev.title || t("events.no_title")}
                    </div>
                    {locationName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{locationName}</span>
                      </div>
                    )}
                    {getParticipantCount(ev) > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Users className="w-3 h-3 flex-shrink-0" />
                        <span>{getParticipantCount(ev)}</span>
                      </div>
                    )}
                    {calendar && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {calendar.name}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
