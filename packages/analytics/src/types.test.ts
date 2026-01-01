/**
 * Tests for Analytics types and error classes
 */

import { describe, expect, it } from 'vitest';
import {
  AnalyticsError,
  AuthenticationError,
  InvalidDimensionError,
  InvalidMetricError,
  NotSupportedError,
  PropertyNotFoundError,
  QuotaExceededError,
  RateLimitError,
} from './shared/types';

describe('Analytics Error Classes', () => {
  describe('AnalyticsError', () => {
    it('should create basic analytics error', () => {
      const error = new AnalyticsError('Test error', 'TEST_CODE', 'ga4');

      expect(error.name).toBe('AnalyticsError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.provider).toBe('ga4');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AnalyticsError).toBe(true);
    });

    it('should create analytics error with minimal parameters', () => {
      const error = new AnalyticsError('Minimal error', 'MIN_CODE');

      expect(error.name).toBe('AnalyticsError');
      expect(error.message).toBe('Minimal error');
      expect(error.code).toBe('MIN_CODE');
      expect(error.provider).toBeUndefined();
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError('ga4');

      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Authentication failed');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.provider).toBe('ga4');
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof AuthenticationError).toBe(true);
    });

    it('should create authentication error without provider', () => {
      const error = new AuthenticationError();

      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Authentication failed');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.provider).toBeUndefined();
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('plausible', 60);

      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Rate limit exceeded, retry after 60s');
      expect(error.code).toBe('RATE_LIMIT');
      expect(error.provider).toBe('plausible');
      expect(error.retryAfter).toBe(60);
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof RateLimitError).toBe(true);
    });

    it('should create rate limit error without retry after', () => {
      const error = new RateLimitError('ga4');

      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT');
      expect(error.provider).toBe('ga4');
      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe('PropertyNotFoundError', () => {
    it('should create property not found error', () => {
      const error = new PropertyNotFoundError('123456789', 'ga4');

      expect(error.name).toBe('PropertyNotFoundError');
      expect(error.message).toBe('Property not found: 123456789');
      expect(error.code).toBe('PROPERTY_NOT_FOUND');
      expect(error.provider).toBe('ga4');
      expect(error.propertyId).toBe('123456789');
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof PropertyNotFoundError).toBe(true);
    });
  });

  describe('InvalidDimensionError', () => {
    it('should create invalid dimension error', () => {
      const error = new InvalidDimensionError('invalid_dimension', 'plausible');

      expect(error.name).toBe('InvalidDimensionError');
      expect(error.message).toBe('Invalid dimension: invalid_dimension');
      expect(error.code).toBe('INVALID_DIMENSION');
      expect(error.provider).toBe('plausible');
      expect(error.dimension).toBe('invalid_dimension');
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof InvalidDimensionError).toBe(true);
    });
  });

  describe('InvalidMetricError', () => {
    it('should create invalid metric error', () => {
      const error = new InvalidMetricError('invalid_metric', 'ga4');

      expect(error.name).toBe('InvalidMetricError');
      expect(error.message).toBe('Invalid metric: invalid_metric');
      expect(error.code).toBe('INVALID_METRIC');
      expect(error.provider).toBe('ga4');
      expect(error.metric).toBe('invalid_metric');
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof InvalidMetricError).toBe(true);
    });
  });

  describe('QuotaExceededError', () => {
    it('should create quota exceeded error with quota type', () => {
      const error = new QuotaExceededError('ga4', 'daily_requests');

      expect(error.name).toBe('QuotaExceededError');
      expect(error.message).toBe('Quota exceeded: daily_requests');
      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.provider).toBe('ga4');
      expect(error.quotaType).toBe('daily_requests');
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof QuotaExceededError).toBe(true);
    });

    it('should create quota exceeded error without quota type', () => {
      const error = new QuotaExceededError('plausible');

      expect(error.name).toBe('QuotaExceededError');
      expect(error.message).toBe('Quota exceeded');
      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.provider).toBe('plausible');
      expect(error.quotaType).toBeUndefined();
    });
  });

  describe('NotSupportedError', () => {
    it('should create not supported error', () => {
      const error = new NotSupportedError('dataStreams', 'plausible');

      expect(error.name).toBe('NotSupportedError');
      expect(error.message).toBe('Feature not supported: dataStreams');
      expect(error.code).toBe('NOT_SUPPORTED');
      expect(error.provider).toBe('plausible');
      expect(error.feature).toBe('dataStreams');
      expect(error instanceof AnalyticsError).toBe(true);
      expect(error instanceof NotSupportedError).toBe(true);
    });
  });
});
