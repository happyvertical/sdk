/**
 * Provider error types, kept free of provider modules so the package entry
 * point can export them without loading optional integrations.
 */

/**
 * Error thrown for a non-2xx Stripe API response. The message is unchanged
 * from earlier releases (`Stripe API error (<status>): <body>`); the parsed
 * Stripe error fields are exposed for callers that branch on them.
 */
export class StripeApiError extends Error {
  readonly status: number;
  /** Stripe error type, for example `card_error` or `invalid_request_error`. */
  readonly type?: string;
  /** Stripe error code, for example `card_declined` or `resource_missing`. */
  readonly code?: string;
  /** Issuer decline code for card errors. */
  readonly declineCode?: string;
  /** Stripe's human-readable error message (never contains card data). */
  readonly stripeMessage?: string;
  /** The PaymentIntent a failed confirmation left behind, if any. */
  readonly paymentIntent?: unknown;

  constructor(status: number, body: string) {
    super(`Stripe API error (${status}): ${body}`);
    this.name = 'StripeApiError';
    this.status = status;
    let parsed: { error?: Record<string, unknown> } | undefined;
    try {
      parsed = JSON.parse(body) as { error?: Record<string, unknown> };
    } catch {
      // Non-JSON bodies (proxies, outages) keep only the status and message.
      parsed = undefined;
    }
    const error = parsed?.error;
    if (error && typeof error === 'object') {
      this.type = str(error.type);
      this.code = str(error.code);
      this.declineCode = str(error.decline_code);
      this.stripeMessage = str(error.message);
      this.paymentIntent = error.payment_intent;
    }
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
