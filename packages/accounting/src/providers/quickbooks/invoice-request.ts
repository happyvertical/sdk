import { createHash } from 'node:crypto';
import type {
  CreditMemoInput,
  InvoiceInput,
  InvoiceLineItemInput,
  QuickBooksCreditMemoRequest,
  QuickBooksInvoiceRequest,
} from '../../types.js';
import {
  currencyMinorUnitFactor,
  isCurrencyMinorUnit,
  matchesCurrencyRoundedLineAmount,
  roundCurrencyAmount,
} from './line-amount.js';

type QuickBooksCreateRequest =
  | QuickBooksInvoiceRequest
  | QuickBooksCreditMemoRequest;

interface QuickBooksSalesLine {
  LineNum: number;
  Description: string;
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail: {
    Qty: number;
    UnitPrice: number;
    ItemRef?: { value: string };
    TaxCodeRef?: { value: string };
    TaxInclusiveAmt?: number;
  };
}

interface QuickBooksTaxLine {
  Amount: number;
  DetailType: 'TaxLineDetail';
  TaxLineDetail: {
    TaxRateRef: { value: string };
    TaxPercent: number;
    PercentBased: true;
  };
}

interface FrozenTaxComponent {
  taxRateRef: string;
  rate: DecimalRate;
  taxMinor: bigint;
}

interface DecimalRate {
  numerator: bigint;
  denominator: bigint;
  value: number;
}

/** Prepare once, persist before sending, and reuse unchanged. Performs no I/O. */
export function prepareQuickBooksInvoiceRequest(
  invoice: InvoiceInput,
  identity: Omit<QuickBooksInvoiceRequest, 'payloadHash'>,
): QuickBooksInvoiceRequest {
  if (invoice.externalId)
    throw new Error('QuickBooks request identity is only for invoice creation');
  return prepareRequest(mapInvoiceToQBO(invoice), identity, 'invoice');
}

/** Prepare once, persist before sending, and reuse unchanged. Performs no I/O. */
export function prepareQuickBooksCreditMemoRequest(
  creditMemo: CreditMemoInput,
  identity: Omit<
    QuickBooksCreditMemoRequest,
    'payloadHash' | 'creditedInvoiceExternalId'
  >,
): QuickBooksCreditMemoRequest {
  if (creditMemo.externalId)
    throw new Error(
      'QuickBooks request identity is only for credit memo creation',
    );
  return prepareRequest(
    mapCreditMemoToQBO(creditMemo),
    {
      ...identity,
      creditedInvoiceExternalId: creditMemo.creditedInvoiceExternalId,
    },
    'credit memo',
  );
}

function prepareRequest<T extends QuickBooksCreateRequest>(
  mapped: unknown,
  identity: Omit<T, 'payloadHash'>,
  kind: 'invoice' | 'credit memo',
): T {
  const payload = JSON.stringify(mapped);
  const request = {
    ...identity,
    payloadHash: hashDescriptorPayload(payload, identity, kind),
  } as T;
  validateRequest(
    request,
    identity.realmId,
    identity.environment,
    payload,
    kind,
  );
  return Object.freeze(request);
}

function hash(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/** Bind a credit memo's immutable source invoice without sending it to QBO. */
function hashDescriptorPayload(
  payload: string,
  request:
    | QuickBooksCreateRequest
    | Omit<QuickBooksCreateRequest, 'payloadHash'>,
  kind: 'invoice' | 'credit memo',
): string {
  if (kind === 'invoice') return hash(payload);
  const creditMemoRequest = request as QuickBooksCreditMemoRequest;
  return hash(
    JSON.stringify({
      payload,
      linkage: {
        creditedInvoiceExternalId: creditMemoRequest.creditedInvoiceExternalId,
      },
    }),
  );
}

export function validateQuickBooksInvoiceRequest(
  request: QuickBooksInvoiceRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
): void {
  validateRequest(request, realmId, environment, payload, 'invoice');
}

export function validateQuickBooksCreditMemoRequest(
  request: QuickBooksCreditMemoRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
): void {
  validateRequest(request, realmId, environment, payload, 'credit memo');
}

function validateRequest(
  request: QuickBooksCreateRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
  kind: 'invoice' | 'credit memo',
): void {
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,50}$/.test(request.requestId)
  ) {
    throw new Error(
      'QuickBooks requestId must contain 1–50 URL-safe letters, digits, dots, underscores or hyphens',
    );
  }
  if (
    !request.realmId ||
    request.realmId !== realmId ||
    !['sandbox', 'production'].includes(request.environment) ||
    request.environment !== environment
  ) {
    throw new Error(`QuickBooks ${kind} request realm/environment mismatch`);
  }
  if (
    !payload ||
    request.payloadHash !== hashDescriptorPayload(payload, request, kind)
  ) {
    throw new Error(
      `QuickBooks ${kind} request payload mismatch; reconcile the original request`,
    );
  }
  if (
    kind === 'credit memo' &&
    (!('creditedInvoiceExternalId' in request) ||
      !request.creditedInvoiceExternalId ||
      request.creditedInvoiceExternalId.trim() !==
        request.creditedInvoiceExternalId)
  ) {
    throw new Error(
      'QuickBooks credit memo request requires a credited invoice external ID',
    );
  }
  const parsed = JSON.parse(payload);
  if (parsed.Id !== undefined || parsed.SyncToken !== undefined) {
    throw new Error(`QuickBooks request identity is only for ${kind} creation`);
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function close(a: number, b: number): boolean {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <=
      Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8
  );
}

function finite(value: number, label: string, allowNegative = false): number {
  if (!Number.isFinite(value) || (!allowNegative && value < 0))
    throw new Error(
      `QuickBooks ${label} must be a finite ${allowNegative ? '' : 'non-negative '}amount`,
    );
  return value;
}

function reference(value: string | undefined, label: string) {
  if (!value || value.trim() !== value || value.length > 255)
    throw new Error(`QuickBooks ${label} must be a non-empty realm reference`);
  return { value };
}

function canonicalRateNumber(value: number): string {
  // Number inputs can carry an adjacent binary representation of the exact
  // frozen decimal (for example 0.1 + 0.2). Prefer the shortest nearby decimal
  // through the calculator's supported precision, without changing a value
  // whose additional digits are materially distinct.
  for (let places = 0; places <= 12; places++) {
    const candidate = Number(value.toFixed(places));
    if (close(value, candidate)) return candidate.toString();
  }
  return value.toString();
}

function decimalRate(
  value: number | string | undefined,
  label: string,
): DecimalRate {
  const text =
    typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
      ? value
      : typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? canonicalRateNumber(value)
        : undefined;
  if (!text || !/^\d+(?:\.\d+)?$/.test(text))
    throw new Error(
      `QuickBooks ${label} needs a frozen component rate from 0 through 1`,
    );
  const [whole, fraction = ''] = text.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(`${whole}${fraction}`);
  if (numerator > denominator)
    throw new Error(
      `QuickBooks ${label} needs a frozen component rate from 0 through 1`,
    );
  return { numerator, denominator, value: Number(text) };
}

function ratesEqual(left: DecimalRate, right: DecimalRate): boolean {
  return (
    left.numerator * right.denominator === right.numerator * left.denominator
  );
}

function addRates(left: DecimalRate, right: DecimalRate): DecimalRate {
  const numerator =
    left.numerator * right.denominator + right.numerator * left.denominator;
  const denominator = left.denominator * right.denominator;
  return {
    numerator,
    denominator,
    value: Number(numerator) / Number(denominator),
  };
}

function taxPercent(rate: DecimalRate): number {
  return Number(rate.numerator * 100n) / Number(rate.denominator);
}

function currencyMinor(
  amount: number,
  currency: string | undefined,
  label: string,
): bigint {
  const factor = currencyMinorUnitFactor(currency);
  const rounded = roundCurrencyAmount(amount, currency);
  if (
    factor === undefined ||
    rounded === undefined ||
    (!isCurrencyMinorUnit(amount, currency) && !close(amount, rounded))
  )
    throw new Error(
      `QuickBooks ${label} must fit the explicitly supplied currency's ISO 4217 minor-unit grid`,
    );
  // Match frozenCurrencyAmount: only a value already admitted as ordinary
  // binary noise is normalized before exact minor-unit aggregation. A genuine
  // off-grid value still refuses before any request is mapped.
  return BigInt(
    Math.round(
      (isCurrencyMinorUnit(amount, currency) ? amount : rounded) * factor,
    ),
  );
}

function currencyMajor(minor: bigint, currency: string | undefined): number {
  const factor = currencyMinorUnitFactor(currency);
  if (factor === undefined)
    throw new Error('QuickBooks needs a known currency');
  return Number(minor) / factor;
}

function taxMinorMatchesAllocation(
  taxMinor: bigint,
  numerator: bigint,
  denominator: bigint,
): boolean {
  const floor = numerator / denominator;
  const remainder = numerator % denominator;
  return taxMinor === floor || (remainder !== 0n && taxMinor === floor + 1n);
}

function validateFrozenComponentRates(
  components: readonly FrozenTaxComponent[],
  taxableAmount: number,
  currency: string | undefined,
  inclusive: boolean,
  label: string,
): void {
  const taxableMinor = currencyMinor(
    taxableAmount,
    currency,
    `${label} taxable amount`,
  );
  const totalRate = components.reduce(
    (sum, component) => addRates(sum, component.rate),
    { numerator: 0n, denominator: 1n, value: 0 },
  );
  for (const component of components) {
    const numerator = inclusive
      ? taxableMinor * component.rate.numerator * totalRate.denominator
      : taxableMinor * component.rate.numerator;
    const denominator = inclusive
      ? component.rate.denominator *
        (totalRate.denominator + totalRate.numerator)
      : component.rate.denominator;
    if (!taxMinorMatchesAllocation(component.taxMinor, numerator, denominator))
      throw new Error(
        `QuickBooks ${label} tax component rate is inconsistent with its frozen tax amount`,
      );
  }
}

function frozenCurrencyAmount(
  value: number,
  label: string,
  currency: string | undefined,
  allowNegative = false,
): number {
  finite(value, label, allowNegative);
  const rounded = roundCurrencyAmount(value, currency);
  // Stored decimal money can reach JavaScript as an adjacent binary value
  // (for example 0.1 * 3). Accept that representation only when the known
  // currency round-trip differs by ordinary floating-point noise; this never
  // authorizes a real off-grid amount such as CAD 0.005 or JPY 100.5.
  if (
    !isCurrencyMinorUnit(value, currency) &&
    (rounded === undefined || !close(value, rounded))
  )
    throw new Error(
      `QuickBooks ${label} must fit the explicitly supplied currency's ISO 4217 minor-unit grid`,
    );
  return value;
}

function hasFrozenSnapshots(
  input: Pick<InvoiceInput, 'quickbooksMapping' | 'lineItems'>,
): boolean {
  return (
    input.quickbooksMapping?.globalTaxCalculation === 'TaxInclusive' ||
    input.lineItems.some(
      (item) =>
        item.taxAmount !== undefined ||
        item.taxComponents !== undefined ||
        item.taxInclusiveAmount !== undefined ||
        (item.discount !== undefined && item.discount !== 0),
    )
  );
}

/** Limit accumulated binary error when a valid document has many decimal lines. */
function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = next - sum - adjusted;
    sum = next;
  }
  return sum;
}

function mapDocumentLines(
  input: Pick<
    InvoiceInput,
    | 'lineItems'
    | 'subtotal'
    | 'taxAmount'
    | 'totalAmount'
    | 'currency'
    | 'quickbooksMapping'
  >,
): { lines: QuickBooksSalesLine[]; taxLines: QuickBooksTaxLine[] } {
  const mode = input.quickbooksMapping?.globalTaxCalculation;
  if (mode && !['TaxExcluded', 'TaxInclusive', 'NotApplicable'].includes(mode))
    throw new Error(
      'QuickBooks globalTaxCalculation must be TaxExcluded, TaxInclusive or NotApplicable',
    );
  const frozen = hasFrozenSnapshots(input);
  const validateAmount = (value: number, label: string) =>
    frozen
      ? frozenCurrencyAmount(value, label, input.currency)
      : finite(value, label);
  validateAmount(input.subtotal, 'subtotal');
  validateAmount(input.taxAmount, 'tax amount');
  validateAmount(input.totalAmount, 'total amount');
  if (input.lineItems.length === 0)
    throw new Error('QuickBooks invoices require at least one sales line');
  const hasLineMapping = input.lineItems.some((item) => item.quickbooksMapping);
  if ((input.taxAmount > 0 || hasLineMapping) && !input.quickbooksMapping)
    throw new Error(
      'QuickBooks mapped or nonzero-tax invoices require explicit globalTaxCalculation',
    );
  if (
    input.quickbooksMapping &&
    input.lineItems.some((item) => !item.quickbooksMapping)
  )
    throw new Error(
      'QuickBooks mapped invoices require itemRef and taxCodeRef on every line',
    );
  if (input.taxAmount > 0 && mode === 'NotApplicable')
    throw new Error(
      'QuickBooks nonzero tax cannot use NotApplicable global tax calculation',
    );

  const mapped: QuickBooksSalesLine[] = [];
  const taxLines = new Map<
    string,
    { rate: DecimalRate; amountMinor: bigint }
  >();
  const snapshotLineTaxes: number[] = [];
  let hasAnyLineTax = false;
  let hasCompleteLineTax = true;
  const lineTaxSnapshots: Array<{
    taxAmount: number | undefined;
    taxComponents: readonly FrozenTaxComponent[];
  }> = [];
  for (const [index, item] of input.lineItems.entries()) {
    const line = mapLine(item, index, input.currency, mode, frozen);
    mapped.push(...line.lines);
    lineTaxSnapshots.push({
      taxAmount: line.taxAmount,
      taxComponents: line.taxComponents,
    });
    if (line.taxAmount === undefined) hasCompleteLineTax = false;
    else {
      hasAnyLineTax = true;
      snapshotLineTaxes.push(line.taxAmount);
    }
    for (const component of line.taxComponents) {
      const existing = taxLines.get(component.taxRateRef);
      if (existing) {
        if (!ratesEqual(existing.rate, component.rate))
          throw new Error(
            `QuickBooks tax rate ${component.taxRateRef} has inconsistent frozen rates`,
          );
        existing.amountMinor += component.taxMinor;
      } else {
        taxLines.set(component.taxRateRef, {
          rate: component.rate,
          amountMinor: component.taxMinor,
        });
      }
    }
  }
  const mappedSubtotal = compensatedSum(mapped.map((line) => line.Amount));
  if (!close(mappedSubtotal, input.subtotal))
    throw new Error('QuickBooks line amounts must equal the invoice subtotal');
  if (!close(input.subtotal + input.taxAmount, input.totalAmount))
    throw new Error(
      'QuickBooks subtotal plus tax must equal the invoice total',
    );
  if (taxLines.size > 0) {
    if (
      lineTaxSnapshots.some(
        (line) =>
          line.taxAmount === undefined ||
          (line.taxAmount > 0 && line.taxComponents.length === 0),
      )
    )
      throw new Error(
        'QuickBooks component tax detail requires components on every taxed line',
      );
    const totalTaxMinor = currencyMinor(
      input.taxAmount,
      input.currency,
      'tax amount',
    );
    const detailTaxMinor = [...taxLines.values()].reduce(
      (sum, line) => sum + line.amountMinor,
      0n,
    );
    if (detailTaxMinor !== totalTaxMinor)
      throw new Error(
        'QuickBooks component tax detail must equal the invoice tax amount',
      );
  }
  if (hasAnyLineTax && !hasCompleteLineTax)
    throw new Error(
      'QuickBooks stored line tax must be supplied on every line when any line supplies it',
    );
  if (
    hasAnyLineTax &&
    !close(compensatedSum(snapshotLineTaxes), input.taxAmount)
  )
    throw new Error(
      'QuickBooks stored line tax must equal the invoice tax amount',
    );
  return {
    lines: mapped,
    taxLines: [...taxLines.entries()].map(([taxRateRef, detail]) => ({
      Amount: currencyMajor(detail.amountMinor, input.currency),
      DetailType: 'TaxLineDetail',
      TaxLineDetail: {
        TaxRateRef: { value: taxRateRef },
        TaxPercent: taxPercent(detail.rate),
        PercentBased: true,
      },
    })),
  };
}

function mapLine(
  item: InvoiceLineItemInput,
  index: number,
  currency: string | undefined,
  mode: 'TaxExcluded' | 'TaxInclusive' | 'NotApplicable' | undefined,
  enforceCurrencyGrid: boolean,
): {
  lines: QuickBooksSalesLine[];
  taxAmount?: number;
  taxComponents: FrozenTaxComponent[];
} {
  const label = `line ${index + 1}`;
  if (item.taxRate !== undefined && item.taxRate !== 0)
    throw new Error(
      'QuickBooks numeric taxRate is not supported; use a realm taxCodeRef',
    );
  if (item.taxCode !== undefined)
    throw new Error(
      'QuickBooks generic taxCode is not a realm tax reference; use quickbooksMapping.taxCodeRef',
    );
  finite(item.quantity, `${label} quantity`);
  if (item.quantity <= 0)
    throw new Error(`QuickBooks ${label} quantity must be greater than zero`);
  finite(item.unitPrice, `${label} unit price`);
  const baseDocumentAmount = item.quantity * item.unitPrice;
  finite(baseDocumentAmount, `${label} pre-discount amount`);
  const validateAmount = (
    value: number,
    amountLabel: string,
    allowNegative = false,
  ) =>
    enforceCurrencyGrid
      ? frozenCurrencyAmount(value, amountLabel, currency, allowNegative)
      : finite(value, amountLabel, allowNegative);
  const discount = validateAmount(item.discount ?? 0, `${label} discount`);
  if (discount > baseDocumentAmount && !close(discount, baseDocumentAmount))
    throw new Error(
      `QuickBooks ${label} discount cannot exceed quantity times unit price`,
    );
  const netAmount = validateAmount(
    item.amount ?? baseDocumentAmount - discount,
    `${label} amount`,
  );
  const taxAmount =
    item.taxAmount === undefined
      ? undefined
      : validateAmount(item.taxAmount, `${label} tax amount`);
  const taxComponents: FrozenTaxComponent[] = [];
  if (item.taxComponents !== undefined) {
    if (taxAmount === undefined)
      throw new Error(
        `QuickBooks ${label} tax components require a line tax amount`,
      );
    const componentTax = item.taxComponents.reduce(
      (sum, component, componentIndex) => {
        if (
          !component.taxCode ||
          component.taxCode.trim() !== component.taxCode
        )
          throw new Error(
            `QuickBooks ${label} tax component ${componentIndex + 1} needs a tax code`,
          );
        const rate = decimalRate(
          component.rate,
          `${label} tax component ${componentIndex + 1}`,
        );
        const taxRateRef = reference(
          component.quickbooksTaxRateRef,
          `${label} tax component ${componentIndex + 1} quickbooksTaxRateRef`,
        ).value;
        const componentAmount = validateAmount(
          component.taxAmount,
          `${label} tax component ${componentIndex + 1}`,
        );
        taxComponents.push({
          taxRateRef,
          rate,
          taxMinor: currencyMinor(
            componentAmount,
            currency,
            `${label} tax component ${componentIndex + 1}`,
          ),
        });
        return sum + componentAmount;
      },
      0,
    );
    if (!close(componentTax, taxAmount))
      throw new Error(
        `QuickBooks ${label} tax components must equal the line tax amount`,
      );
  }

  const inclusive = mode === 'TaxInclusive';
  const grossAmount = item.taxInclusiveAmount;
  if (!inclusive && grossAmount !== undefined)
    throw new Error(
      `QuickBooks ${label} tax-inclusive amount requires TaxInclusive global tax calculation`,
    );
  if (inclusive) {
    if (
      grossAmount === undefined ||
      taxAmount === undefined ||
      (taxAmount > 0 && !item.taxComponents?.length)
    )
      throw new Error(
        `QuickBooks ${label} TaxInclusive snapshots require gross amount, line tax and tax components for nonzero tax`,
      );
    validateAmount(grossAmount, `${label} tax-inclusive amount`);
    if (!close(netAmount + taxAmount, grossAmount))
      throw new Error(
        `QuickBooks ${label} net amount plus tax must equal gross amount`,
      );
    if (!close(baseDocumentAmount - discount, grossAmount))
      throw new Error(
        `QuickBooks ${label} gross amount must equal quantity times gross unit price less gross discount`,
      );
  } else if (
    !close(netAmount, baseDocumentAmount - discount) &&
    !matchesCurrencyRoundedLineAmount(
      item.quantity,
      item.unitPrice,
      netAmount + discount,
      currency,
    )
  ) {
    throw new Error(
      `QuickBooks ${label} amount must equal quantity times unit price less discount`,
    );
  }
  if (taxComponents.length > 0)
    validateFrozenComponentRates(
      taxComponents,
      inclusive ? (grossAmount as number) : netAmount,
      currency,
      inclusive,
      label,
    );

  const itemRef = item.quickbooksMapping
    ? reference(item.quickbooksMapping.itemRef, `${label} itemRef`)
    : undefined;
  const taxCodeRef = item.quickbooksMapping
    ? reference(item.quickbooksMapping.taxCodeRef, `${label} taxCodeRef`)
    : undefined;
  const line = (
    amount: number,
    quantity: number,
    unitPrice: number,
    description: string,
    taxInclusiveAmount?: number,
  ) => ({
    LineNum: index + 1,
    Description: description,
    Amount: amount,
    DetailType: 'SalesItemLineDetail' as const,
    SalesItemLineDetail: {
      Qty: quantity,
      UnitPrice: unitPrice,
      ItemRef: itemRef,
      TaxCodeRef: taxCodeRef,
      ...(taxInclusiveAmount === undefined
        ? {}
        : { TaxInclusiveAmt: taxInclusiveAmount }),
    },
  });

  if (discount === 0 && !inclusive) {
    return {
      lines: [line(netAmount, item.quantity, item.unitPrice, item.description)],
      taxAmount,
      taxComponents,
    };
  }
  if (
    discount === 0 ||
    isCurrencyMinorUnit(netAmount / item.quantity, currency)
  ) {
    return {
      lines: [
        line(
          netAmount,
          item.quantity,
          netAmount / item.quantity,
          item.description,
          inclusive ? grossAmount : undefined,
        ),
      ],
      taxAmount,
      taxComponents,
    };
  }

  let preDiscountAmount = netAmount + discount;
  let negativeAmount = -discount;
  const preDiscountGross = inclusive ? baseDocumentAmount : undefined;
  if (inclusive) {
    const components = item.taxComponents;
    if (!components?.length)
      throw new Error(
        `QuickBooks ${label} needs frozen component rates for an inclusive negative discount line`,
      );
    const rate = components.reduce(
      (sum, component, componentIndex) =>
        sum +
        decimalRate(
          component.rate,
          `${label} tax component ${componentIndex + 1}`,
        ).value,
      0,
    );
    const discountNet = roundCurrencyAmount(discount / (1 + rate), currency);
    if (discountNet === undefined)
      throw new Error(
        `QuickBooks ${label} needs a recognized currency to map an inclusive fractional-unit discount`,
      );
    preDiscountAmount = netAmount + discountNet;
    negativeAmount = -discountNet;
  }
  if (enforceCurrencyGrid) {
    frozenCurrencyAmount(
      preDiscountAmount,
      `${label} generated pre-discount amount`,
      currency,
    );
    frozenCurrencyAmount(
      negativeAmount,
      `${label} generated discount amount`,
      currency,
      true,
    );
  }
  let negativeGross: number | undefined;
  if (inclusive) {
    if (grossAmount === undefined || preDiscountGross === undefined)
      throw new Error(
        `QuickBooks ${label} needs frozen gross amounts for an inclusive negative discount line`,
      );
    const unroundedNegativeGross = grossAmount - preDiscountGross;
    negativeGross =
      roundCurrencyAmount(unroundedNegativeGross, currency) ??
      unroundedNegativeGross;
  }
  if (enforceCurrencyGrid && negativeGross !== undefined) {
    frozenCurrencyAmount(
      negativeGross,
      `${label} generated gross discount amount`,
      currency,
      true,
    );
  }
  return {
    lines: [
      line(
        preDiscountAmount,
        item.quantity,
        preDiscountAmount / item.quantity,
        item.description,
        preDiscountGross,
      ),
      line(
        negativeAmount,
        1,
        negativeAmount,
        `Discount on line ${index + 1}`,
        negativeGross,
      ),
    ],
    taxAmount,
    taxComponents,
  };
}

function basePayload(
  input: Pick<
    InvoiceInput,
    | 'customerId'
    | 'customerExternalId'
    | 'issueDate'
    | 'subtotal'
    | 'taxAmount'
    | 'totalAmount'
    | 'currency'
    | 'memo'
    | 'lineItems'
    | 'quickbooksMapping'
  >,
  number: string,
  dueDate?: Date,
) {
  const { lines, taxLines } = mapDocumentLines(input);
  return {
    CustomerRef: { value: input.customerExternalId || input.customerId },
    DocNumber: number,
    TxnDate: formatLocalDate(input.issueDate),
    ...(dueDate ? { DueDate: formatLocalDate(dueDate) } : {}),
    Line: lines,
    GlobalTaxCalculation: input.quickbooksMapping?.globalTaxCalculation,
    TxnTaxDetail: input.quickbooksMapping
      ? {
          TotalTax: input.taxAmount,
          ...(taxLines.length > 0 ? { TaxLine: taxLines } : {}),
        }
      : undefined,
    CurrencyRef: input.currency ? { value: input.currency } : undefined,
    CustomerMemo: input.memo ? { value: input.memo } : undefined,
  };
}

export function mapInvoiceToQBO(invoice: InvoiceInput) {
  if (invoice.collectionMethod === 'charge_automatically')
    throw new Error(
      'QuickBooks does not support charge_automatically invoice collection',
    );
  if (invoice.automaticTax)
    throw new Error(
      'QuickBooks does not support automaticTax invoice calculation',
    );
  return basePayload(
    invoice,
    invoice.invoiceNumber,
    invoice.dueDate,
  ) as ReturnType<typeof basePayload> & { DueDate: string };
}

export function mapCreditMemoToQBO(creditMemo: CreditMemoInput) {
  if (
    !creditMemo.creditedInvoiceExternalId ||
    creditMemo.creditedInvoiceExternalId.trim() !==
      creditMemo.creditedInvoiceExternalId
  )
    throw new Error(
      'QuickBooks credit memos require a credited invoice external ID',
    );
  return basePayload(creditMemo, creditMemo.creditMemoNumber);
}
