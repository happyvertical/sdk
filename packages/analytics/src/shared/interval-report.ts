import type {
  IntervalReportOptions,
  IntervalReportResult,
  TimestampInterval,
} from './types.js';

function parseInstant(value: string): number {
  if (typeof value !== 'string')
    throw new RangeError('Interval timestamps must be strings');
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!match || match[8] === '-00:00') {
    throw new RangeError(
      'Interval timestamps require an explicit known offset and millisecond precision or less',
    );
  }
  const [, year, month, day] = match;
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const instant = Date.parse(value);
  if (
    !Number.isFinite(instant) ||
    calendar.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
  ) {
    throw new RangeError('Invalid interval timestamp');
  }
  return instant;
}

/** Validate before any provider request. Preserve the caller's zone and instants. */
export function validateIntervalReport(
  options: IntervalReportOptions,
): TimestampInterval {
  const { interval, metrics } = options;
  if (
    !interval ||
    typeof interval.timeZone !== 'string' ||
    !interval.timeZone ||
    /^[+-]/.test(interval.timeZone)
  ) {
    throw new RangeError('An explicit IANA timezone is required');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: interval.timeZone });
  } catch {
    throw new RangeError('Invalid interval timezone');
  }
  const start = parseInstant(interval.startTime);
  const end = parseInstant(interval.endTime);
  if (start >= end)
    throw new RangeError('Interval must be non-empty and ordered');
  if (
    !Array.isArray(metrics) ||
    metrics.length === 0 ||
    metrics.some(
      (metric) =>
        !metric || typeof metric.name !== 'string' || !metric.name.trim(),
    ) ||
    new Set(metrics.map((metric) => metric.name)).size !== metrics.length
  ) {
    throw new RangeError('At least one distinct named metric is required');
  }
  return { ...interval };
}

export function unsupportedIntervalReport(
  options: IntervalReportOptions,
): IntervalReportResult {
  return {
    status: 'unsupported',
    interval: validateIntervalReport(options),
    reason: 'timestamp-precision',
  };
}
