import { parseISO } from "date-fns";
import { parseDuration } from "@/components/calendar/event-card";
import type { CalendarEvent } from "@/lib/jmap/types";

export function getEventEndDate(event: CalendarEvent): Date {
  const start = new Date(event.start);
  if (!event.duration) return start;
  return new Date(start.getTime() + parseDuration(event.duration) * 60000);
}

export function getEventLastVisibleDate(event: CalendarEvent): Date {
  const start = new Date(event.start);
  const end = getEventEndDate(event);
  if (end.getTime() <= start.getTime()) return start;
  return new Date(end.getTime() - 1);
}

export function layoutOverlappingEvents(
  events: CalendarEvent[],
): { event: CalendarEvent; column: number; totalColumns: number }[] {
  const sorted = [...events].sort((a, b) => {
    const diff = new Date(a.start).getTime() - new Date(b.start).getTime();
    if (diff !== 0) return diff;
    return parseDuration(b.duration) - parseDuration(a.duration);
  });

  const columns: { event: CalendarEvent; end: number }[][] = [];
  const result: { event: CalendarEvent; column: number; totalColumns: number }[] = [];

  for (const event of sorted) {
    const start = parseISO(event.start);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = startMin + Math.max(15, parseDuration(event.duration));
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (columns[col].every(e => e.end <= startMin)) {
        columns[col].push({ event, end: endMin });
        result.push({ event, column: col, totalColumns: 0 });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([{ event, end: endMin }]);
      result.push({ event, column: columns.length - 1, totalColumns: 0 });
    }
  }

  const total = columns.length;
  result.forEach(r => r.totalColumns = total);
  return result;
}

export function formatSnapTime(minutes: number, timeFormat: "12h" | "24h"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (timeFormat === "12h") {
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
