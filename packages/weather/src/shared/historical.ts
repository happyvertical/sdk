import type { HistoricalFetchOptions, WeatherForecast } from './types';
import { WeatherError } from './types';

export interface HistoricalWindow {
  start: Date;
  end: Date;
}

const HOUR_MS = 60 * 60 * 1000;

export function normalizeHistoricalWindow(
  provider: string,
  options: HistoricalFetchOptions,
): HistoricalWindow {
  const start = parseHistoricalDate(provider, options.start, 'start');
  const end = parseHistoricalDate(
    provider,
    options.end || options.start,
    'end',
  );

  if (end.getTime() < start.getTime()) {
    throw new WeatherError(
      'Historical weather end time must be after start time',
      provider,
      'INVALID_DATE_RANGE',
      {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    );
  }

  return { start, end };
}

export function filterHistoricalWindow<T extends WeatherForecast>(
  forecasts: T[],
  window: HistoricalWindow,
  limit?: number,
): T[] {
  const filtered = forecasts
    .filter(
      (forecast) =>
        forecast.timestamp.getTime() >= window.start.getTime() &&
        forecast.timestamp.getTime() <= window.end.getTime(),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }

  return filtered;
}

export function hoursBetween(start: Date, end: Date): number {
  return Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / HOUR_MS) + 1,
  );
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseHistoricalDate(
  provider: string,
  value: Date | string,
  field: string,
): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new WeatherError(
      `Invalid historical weather ${field} time`,
      provider,
      'INVALID_DATE_RANGE',
      { [field]: value },
    );
  }

  return date;
}
