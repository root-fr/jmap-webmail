import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { getEventEndDate, getEventLastVisibleDate } from '../calendar-utils';
import type { CalendarEvent } from '@/lib/jmap/types';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    start: '2026-05-12T00:00:00',
    duration: 'P1D',
    showWithoutTime: true,
    ...overrides,
  } as CalendarEvent;
}

describe('getEventLastVisibleDate', () => {
  it('keeps a one-day all-day event on its start date', () => {
    const event = makeEvent();

    expect(format(getEventEndDate(event), "yyyy-MM-dd'T'HH:mm:ss")).toBe('2026-05-13T00:00:00');
    expect(format(getEventLastVisibleDate(event), 'yyyy-MM-dd')).toBe('2026-05-12');
  });

  it('keeps a two-day all-day event on the second day but not the third', () => {
    const event = makeEvent({ duration: 'P2D' });

    expect(format(getEventEndDate(event), "yyyy-MM-dd'T'HH:mm:ss")).toBe('2026-05-14T00:00:00');
    expect(format(getEventLastVisibleDate(event), 'yyyy-MM-dd')).toBe('2026-05-13');
  });

  it('does not place a timed event on a day where it ends at midnight', () => {
    const event = makeEvent({
      start: '2026-05-12T23:00:00',
      duration: 'PT1H',
      showWithoutTime: false,
    });

    expect(format(getEventEndDate(event), "yyyy-MM-dd'T'HH:mm:ss")).toBe('2026-05-13T00:00:00');
    expect(format(getEventLastVisibleDate(event), 'yyyy-MM-dd')).toBe('2026-05-12');
  });

  it('uses the start date for zero-duration events', () => {
    const event = makeEvent({ duration: 'PT0M', showWithoutTime: false });

    expect(format(getEventLastVisibleDate(event), "yyyy-MM-dd'T'HH:mm:ss")).toBe('2026-05-12T00:00:00');
  });
});
