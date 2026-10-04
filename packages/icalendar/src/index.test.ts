import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ICalendarDocumentError,
  ICalendarLimitError,
  ICalendarParseError,
  parseICalendar,
} from './index.js';

const fixturePath = fileURLToPath(
  new URL('./__fixtures__/recurrence.ics', import.meta.url),
);
const fixture = await readFile(fixturePath, 'utf8');

describe('parseICalendar', () => {
  it('preserves RFC 5545 event fields and folded properties through ical.js', () => {
    const document = parseICalendar(fixture);
    const events = document.component.getAllSubcomponents('vevent');
    const master = events[0];
    const detached = events[1];

    expect(events).toHaveLength(2);
    expect(master.getFirstPropertyValue('uid')).toBe('series-42@example.test');
    expect(master.getFirstProperty('dtstart')?.getFirstParameter('tzid')).toBe(
      'America/Edmonton',
    );
    expect(master.getFirstProperty('rrule')).not.toBeNull();
    expect(master.getAllProperties('exdate')).toHaveLength(1);
    expect(master.getAllProperties('rdate')).toHaveLength(1);
    expect(master.getFirstPropertyValue('sequence')).toBe(4);
    expect(master.getFirstPropertyValue('dtstamp')).not.toBeNull();
    expect(master.getFirstPropertyValue('summary')).toBe(
      'Community planning committee meets to review the annual\n budget andnext steps',
    );
    expect(
      detached.getFirstProperty('recurrence-id')?.getFirstParameter('tzid'),
    ).toBe('America/Edmonton');
    expect(detached.getFirstPropertyValue('status')).toBe('CANCELLED');
    expect(detached.getFirstPropertyValue('sequence')).toBe(5);
  });

  it('rejects malformed RFC 5545 structure', () => {
    expect(() =>
      parseICalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR\r\n'),
    ).toThrow(ICalendarParseError);
  });

  it('requires a VCALENDAR document root', () => {
    expect(() => parseICalendar('BEGIN:VTODO\r\nEND:VTODO\r\n')).toThrow(
      ICalendarDocumentError,
    );
  });

  it('rejects multiple calendar documents', () => {
    expect(() =>
      parseICalendar(
        'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
      ),
    ).toThrow(ICalendarDocumentError);
  });

  it.each([
    ['input bytes', { maxInputBytes: 10 }, 'maxInputBytes'],
    [
      'physical line bytes',
      { maxPhysicalLineBytes: 8 },
      'maxPhysicalLineBytes',
    ],
    [
      'unfolded line bytes',
      { maxUnfoldedLineBytes: 20 },
      'maxUnfoldedLineBytes',
    ],
    ['components', { maxComponents: 2 }, 'maxComponents'],
  ] as const)('enforces the %s limit', (_name, limits, expectedLimit) => {
    const source =
      expectedLimit === 'maxUnfoldedLineBytes'
        ? 'BEGIN:VCALENDAR\r\nSUMMARY:abcdefghij\r\n klmnopqrst\r\nEND:VCALENDAR\r\n'
        : fixture;

    try {
      parseICalendar(source, limits);
      throw new Error('Expected a resource-limit failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ICalendarLimitError);
      expect((error as ICalendarLimitError).limit).toBe(expectedLimit);
    }
  });

  it('rejects invalid configured limits', () => {
    expect(() => parseICalendar(fixture, { maxComponents: 0 })).toThrow(
      RangeError,
    );
  });
});
