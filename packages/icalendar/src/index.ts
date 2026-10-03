import ICAL from 'ical.js';

export { ICAL };

/** An `ical.js` component available to calendar consumers. */
export type ICalendarComponent = InstanceType<typeof ICAL.Component>;
/** An `ical.js` property available to calendar consumers. */
export type ICalendarProperty = InstanceType<typeof ICAL.Property>;
/** A value returned by an `ical.js` property. */
export type ICalendarPropertyValue = ReturnType<
  ICalendarProperty['getFirstValue']
>;

/** Resource limits applied before and immediately after RFC 5545 parsing. */
export interface ICalendarParseLimits {
  /** Maximum UTF-8 bytes in the input. Default: 1 MiB. */
  maxInputBytes?: number;
  /** Maximum UTF-8 bytes in an individual physical line. Default: 16 KiB. */
  maxPhysicalLineBytes?: number;
  /** Maximum UTF-8 bytes in an unfolded logical line. Default: 64 KiB. */
  maxUnfoldedLineBytes?: number;
  /** Maximum component count, including the `VCALENDAR` root. Default: 10,000. */
  maxComponents?: number;
}

/** Fully resolved limits reported with resource-limit failures. */
export interface ResolvedICalendarParseLimits {
  maxInputBytes: number;
  maxPhysicalLineBytes: number;
  maxUnfoldedLineBytes: number;
  maxComponents: number;
}

/** A parsed RFC 5545 document with a single `VCALENDAR` root component. */
export interface ICalendarDocument {
  component: ICalendarComponent;
  limits: ResolvedICalendarParseLimits;
}

/** Base class for the public iCalendar parser error contract. */
export class ICalendarError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The input exceeded a configured parser resource limit. */
export class ICalendarLimitError extends ICalendarError {
  constructor(
    readonly limit: keyof ResolvedICalendarParseLimits,
    readonly actual: number,
    readonly maximum: number,
  ) {
    super(`${limit} limit exceeded: ${actual} > ${maximum}`);
  }
}

/** `ical.js` rejected malformed RFC 5545 input. */
export class ICalendarParseError extends ICalendarError {}

/** Parsed input did not contain exactly one `VCALENDAR` document root. */
export class ICalendarDocumentError extends ICalendarError {}

const DEFAULT_LIMITS: ResolvedICalendarParseLimits = {
  maxInputBytes: 1024 * 1024,
  maxPhysicalLineBytes: 16 * 1024,
  maxUnfoldedLineBytes: 64 * 1024,
  maxComponents: 10_000,
};

function resolveLimits(
  limits: ICalendarParseLimits | undefined,
): ResolvedICalendarParseLimits {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  return resolved;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function enforceLineLimits(
  input: string,
  limits: ResolvedICalendarParseLimits,
): string[] {
  let logicalLine = '';
  let hasLogicalLine = false;
  const logicalLines: string[] = [];

  const checkLogicalLine = (): void => {
    if (!hasLogicalLine) return;
    const byteLength = utf8ByteLength(logicalLine);
    if (byteLength > limits.maxUnfoldedLineBytes) {
      throw new ICalendarLimitError(
        'maxUnfoldedLineBytes',
        byteLength,
        limits.maxUnfoldedLineBytes,
      );
    }
    logicalLines.push(logicalLine);
  };

  for (const physicalLine of input.split(/\r\n|[\n\r]/)) {
    const byteLength = utf8ByteLength(physicalLine);
    if (byteLength > limits.maxPhysicalLineBytes) {
      throw new ICalendarLimitError(
        'maxPhysicalLineBytes',
        byteLength,
        limits.maxPhysicalLineBytes,
      );
    }

    if (
      hasLogicalLine &&
      (physicalLine.startsWith(' ') || physicalLine.startsWith('\t'))
    ) {
      logicalLine += physicalLine.slice(1);
      continue;
    }

    checkLogicalLine();
    logicalLine = physicalLine;
    hasLogicalLine = true;
  }

  checkLogicalLine();
  return logicalLines;
}

function assertExactlyOneCalendarDocument(logicalLines: string[]): void {
  let componentDepth = 0;
  let calendarRoots = 0;

  for (const logicalLine of logicalLines) {
    const begin = /^BEGIN:([^;:]+)$/i.exec(logicalLine);
    if (begin) {
      if (componentDepth === 0 && begin[1].toUpperCase() === 'VCALENDAR') {
        calendarRoots += 1;
      }
      componentDepth += 1;
      continue;
    }

    if (/^END:[^;:]+$/i.test(logicalLine)) {
      componentDepth = Math.max(0, componentDepth - 1);
    }
  }

  if (calendarRoots !== 1) {
    throw new ICalendarDocumentError(
      'Expected exactly one top-level VCALENDAR document',
    );
  }
}

function countComponents(component: ICalendarComponent): number {
  let count = 0;
  const pending = [component];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    count += 1;
    pending.push(...current.getAllSubcomponents());
  }

  return count;
}

/**
 * Parse one bounded RFC 5545 `VCALENDAR` document.
 *
 * This function deliberately does not fetch a feed, choose a floating-time
 * policy, expand recurrence, or persist parsed input. Consumers can use the
 * returned public `ical.js` component API to apply their own domain rules.
 */
export function parseICalendar(
  input: string,
  limits?: ICalendarParseLimits,
): ICalendarDocument {
  const resolvedLimits = resolveLimits(limits);
  const inputBytes = utf8ByteLength(input);
  if (inputBytes > resolvedLimits.maxInputBytes) {
    throw new ICalendarLimitError(
      'maxInputBytes',
      inputBytes,
      resolvedLimits.maxInputBytes,
    );
  }

  const logicalLines = enforceLineLimits(input, resolvedLimits);
  assertExactlyOneCalendarDocument(logicalLines);

  let parsed: unknown;
  try {
    parsed = ICAL.parse(input);
  } catch (error) {
    throw new ICalendarParseError('Invalid RFC 5545 input', { cause: error });
  }

  if (!Array.isArray(parsed) || typeof parsed[0] !== 'string') {
    throw new ICalendarDocumentError(
      'Expected exactly one RFC 5545 calendar document',
    );
  }

  let component: ICalendarComponent;
  try {
    component = new ICAL.Component(parsed);
  } catch (error) {
    throw new ICalendarParseError('Invalid RFC 5545 component', {
      cause: error,
    });
  }

  if (component.name !== 'vcalendar') {
    throw new ICalendarDocumentError('Expected a VCALENDAR document root');
  }

  const componentCount = countComponents(component);
  if (componentCount > resolvedLimits.maxComponents) {
    throw new ICalendarLimitError(
      'maxComponents',
      componentCount,
      resolvedLimits.maxComponents,
    );
  }

  return { component, limits: resolvedLimits };
}
