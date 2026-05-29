import { createHash } from 'node:crypto';
import {
  PaymentConfigurationError,
  PaymentProviderError,
  PaymentVerificationError,
} from '../errors.js';
import {
  currencyMinorUnitDecimals,
  decimalToAtomicUnits,
  decimalToMinorUnitAmount,
  type FetchLike,
  getFetch,
  minorUnitsToDecimal,
  normalizeCurrency,
  normalizeDate,
  normalizeFutureDate,
  normalizeMaxStoredPaymentOptions,
  normalizeMinorUnitAmount,
  normalizeNonEmptyString,
  normalizePositiveMinorUnitAmount,
  normalizeUrlString,
  pollPaymentStatus,
  readJsonResponse,
  rememberPaymentOption,
} from '../shared.js';
import type {
  CreatePaymentOptionInput,
  PaymentBackend,
  PaymentBackendCapabilities,
  PaymentEvent,
  PaymentOption,
  PaymentStatusContext,
  PaymentStatusResult,
  PayoutResult,
  RefundPaymentInput,
  RefundResult,
  SendPayoutInput,
  VerifyX402ProofInput,
  WatchPaymentInput,
  X402VerificationResult,
} from '../types.js';

export const BASE_USDC_BACKEND_ID = 'base-usdc';
export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_MAINNET_CAIP2 = 'eip155:8453';
export const BASE_USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALS = 6;

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const DEFAULT_LOG_LOOKBACK_BLOCKS = 10_000n;
const DEFAULT_MAX_SEEN_X402_TRANSACTION_IDS = 50_000;

export interface BaseUsdcAddressDeriverInput {
  quoteId: string;
  index: number;
  indexes: number[];
  path: string;
}

export interface BaseUsdcSendTransactionInput {
  destination: string;
  amount: number;
  amountAtomic: string;
  currency: 'USDC';
  tokenAddress: string;
  memo?: string;
  quoteId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface BaseUsdcAdapterOptions {
  rpcUrl: string;
  fetch?: FetchLike;
  usdcContractAddress?: string;
  masterXpub?: string;
  derivationPathPrefix?: string;
  addressDeriver?: (
    input: BaseUsdcAddressDeriverInput,
  ) => string | Promise<string>;
  addressIndexForQuote?: (quoteId: string) => number;
  fromBlock?: string | number | bigint;
  confirmations?: number;
  pollIntervalMs?: number;
  maxStoredPaymentOptions?: number;
  /**
   * Opt in only when each quote has a unique deposit address and the
   * returned metadata.searchStartBlock is persisted with quote state.
   */
  allowCumulativeTransferMatching?: boolean;
  x402FacilitatorUrl?: string;
  sendTransaction?: (
    input: BaseUsdcSendTransactionInput,
  ) => Promise<{ transactionId: string; raw?: unknown }>;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface RpcLog {
  address: string;
  blockNumber?: string;
  data: string;
  removed?: boolean;
  topics: string[];
  transactionHash?: string;
}

interface RpcReceipt {
  blockNumber?: string;
  logs?: RpcLog[];
  status?: string;
  transactionHash?: string;
}

interface StoredBaseOption extends PaymentOption {
  expectedAmountAtomic: string;
  searchStartBlock: bigint;
}

export class BaseUsdcAdapter implements PaymentBackend {
  readonly capabilities: PaymentBackendCapabilities;

  private readonly fetch: FetchLike;
  private readonly rpcUrl: string;
  private readonly usdcContractAddress: string;
  private readonly confirmations: number;
  private readonly configuredFromBlock: string | undefined;
  private readonly masterXpub: string | undefined;
  private readonly derivationPathPrefix: string;
  private readonly x402FacilitatorUrl: string | undefined;
  private readonly maxStoredPaymentOptions: number;
  private readonly allowCumulativeTransferMatching: boolean;
  private readonly optionsByQuote = new Map<string, StoredBaseOption>();
  private readonly seenX402TransactionIds = new Set<string>();
  private rpcId = 0;

  constructor(private readonly options: BaseUsdcAdapterOptions) {
    if (typeof options.rpcUrl !== 'string' || !options.rpcUrl.trim()) {
      throw new PaymentConfigurationError(
        'BaseUsdcAdapter requires an RPC URL.',
      );
    }

    this.masterXpub =
      options.masterXpub === undefined
        ? undefined
        : normalizeNonEmptyString(options.masterXpub, 'Base USDC masterXpub');
    this.derivationPathPrefix = normalizeDerivationPathPrefix(
      options.derivationPathPrefix ?? 'm/0',
    );

    if (!this.masterXpub && !options.addressDeriver) {
      throw new PaymentConfigurationError(
        'BaseUsdcAdapter requires masterXpub or addressDeriver.',
      );
    }

    this.fetch = getFetch(options.fetch);
    this.maxStoredPaymentOptions = normalizeMaxStoredPaymentOptions(
      options.maxStoredPaymentOptions,
      'BaseUsdcAdapter maxStoredPaymentOptions',
    );
    this.allowCumulativeTransferMatching =
      options.allowCumulativeTransferMatching === true;
    this.rpcUrl = normalizeUrlString(options.rpcUrl, 'BaseUsdcAdapter rpcUrl');
    this.usdcContractAddress = normalizeAddress(
      options.usdcContractAddress ?? BASE_USDC_CONTRACT,
    );
    this.confirmations = normalizeConfirmationCount(
      options.confirmations ?? 1,
      'BaseUsdcAdapter confirmations',
    );
    this.configuredFromBlock =
      options.fromBlock === undefined
        ? undefined
        : normalizeFromBlock(options.fromBlock);
    this.x402FacilitatorUrl =
      options.x402FacilitatorUrl === undefined
        ? undefined
        : normalizeUrlString(
            options.x402FacilitatorUrl,
            'BaseUsdcAdapter x402FacilitatorUrl',
          ).replace(/\/$/, '');
    this.capabilities = {
      id: BASE_USDC_BACKEND_ID,
      displayName: 'Base USDC',
      settlementCurrency: 'USDC',
      supportedSettlementCurrencies: ['USDC'],
      chain: 'base',
      settlementShape: 'address',
      x402Capable: true,
      confirmationLatency: {
        expectedSeconds: 2,
        minConfirmations: this.confirmations,
        description: 'Base L2 USDC transfer confirmation',
      },
      supportsRefunds: true,
      supportsPayouts: true,
      supportsWebhooks: false,
      metadata: {
        chainId: BASE_MAINNET_CHAIN_ID,
        caip2Network: BASE_MAINNET_CAIP2,
        usdcContractAddress: this.usdcContractAddress,
      },
    };
  }

  async createPaymentOption(
    input: CreatePaymentOptionInput,
  ): Promise<PaymentOption> {
    const quoteId = normalizeNonEmptyString(input.quoteId, 'Base USDC quoteId');
    const expiresAt = normalizeFutureDate(input.expiresAt, 'Base USDC expiry');
    const currency = normalizeCurrency(input.currency, 'Base USDC');
    const amount = normalizePositiveMinorUnitAmount(
      input.amount,
      'Base USDC amount',
    );
    const expectedAmountAtomic = amountToUsdcAtomicUnits(
      amount,
      currency,
      'Base USDC amount',
    );
    const settlementAmount = decimalToMinorUnitAmount(
      BigInt(expectedAmountAtomic),
      USDC_DECIMALS,
      'Base USDC settlement',
    );
    const configuredIndex = this.options.addressIndexForQuote?.(quoteId);
    const indexes =
      configuredIndex === undefined
        ? quoteIdToDerivationIndexes(quoteId)
        : [normalizeDerivationIndex(configuredIndex)];
    const index = indexes[0] ?? 0;
    const path = `${this.derivationPathPrefix}/${indexes.join('/')}`;
    const payTo = normalizeAddress(
      await this.deriveAddress({
        quoteId,
        index,
        indexes,
        path,
      }),
    );
    const searchStartBlock = await this.getCurrentBlockNumber();
    const option: PaymentOption = {
      backendId: this.capabilities.id,
      quoteId,
      payTo,
      settlementShape: 'address',
      settlementCurrency: 'USDC',
      settlementAmount,
      amount,
      currency,
      expiresAt,
      paymentUri: buildUsdcPaymentUri({
        tokenAddress: this.usdcContractAddress,
        payTo,
        amountAtomic: expectedAmountAtomic,
      }),
      metadata: {
        derivationIndex: index,
        derivationIndexes: indexes,
        derivationPath: path,
        caip2Network: BASE_MAINNET_CAIP2,
        tokenAddress: this.usdcContractAddress,
        searchStartBlock: toHexQuantity(searchStartBlock),
      },
    };

    rememberPaymentOption(
      this.optionsByQuote,
      quoteId,
      { ...option, expectedAmountAtomic, searchStartBlock },
      this.maxStoredPaymentOptions,
    );

    return option;
  }

  watchPayment(input: WatchPaymentInput): AsyncIterable<PaymentEvent> {
    return pollPaymentStatus(
      {
        ...input,
        pollIntervalMs:
          input.pollIntervalMs ?? this.options.pollIntervalMs ?? 2_000,
      },
      () => this.getStatus(input.quoteId, input.payTo, input.statusContext),
    );
  }

  async getStatus(
    quoteId: string,
    payTo: string,
    context: PaymentStatusContext = {},
  ): Promise<PaymentStatusResult> {
    const normalizedQuoteId = normalizeNonEmptyString(
      quoteId,
      'Base USDC quoteId',
    );
    const normalizedPayTo = normalizeAddress(payTo);
    const option = this.optionsByQuote.get(normalizedQuoteId);
    const expectedAmountAtomic = resolveExpectedUsdcAmount(option, context);
    const contextSearchStartBlock =
      context.searchStartBlock === undefined
        ? undefined
        : parseHexQuantity(normalizeFromBlock(context.searchStartBlock));
    const searchStartBlock =
      option?.searchStartBlock ?? contextSearchStartBlock;

    if (
      !option &&
      expectedAmountAtomic !== undefined &&
      searchStartBlock === undefined &&
      this.configuredFromBlock === undefined
    ) {
      throw new PaymentConfigurationError(
        'Base USDC getStatus requires statusContext.searchStartBlock when checking stateless payment status without a configured fromBlock.',
      );
    }

    const logs = await this.getTransferLogs(normalizedPayTo, searchStartBlock);
    const matchMinBlock =
      searchStartBlock ?? configuredFromBlockMinBlock(this.configuredFromBlock);
    const matchingTransfer =
      expectedAmountAtomic === undefined
        ? undefined
        : this.allowCumulativeTransferMatching
          ? pickCumulativeTransferMatch(
              logs,
              expectedAmountAtomic,
              undefined,
              matchMinBlock,
            )
          : pickSingleTransferMatch(
              logs,
              expectedAmountAtomic,
              undefined,
              matchMinBlock,
            );

    if (!matchingTransfer) {
      const expiresAt =
        option?.expiresAt ??
        (context.expiresAt === undefined
          ? undefined
          : normalizeDate(context.expiresAt));
      return {
        backendId: this.capabilities.id,
        quoteId: normalizedQuoteId,
        payTo: normalizedPayTo,
        status: expiresAt && expiresAt < new Date() ? 'expired' : 'pending',
        settlementCurrency: 'USDC',
        settlementAmount:
          option?.settlementAmount ??
          (context.settlementAmount === undefined
            ? undefined
            : normalizeMinorUnitAmount(
                context.settlementAmount,
                'Base USDC settlement status',
              )),
        amount:
          option?.amount ??
          (context.amount === undefined
            ? undefined
            : normalizeMinorUnitAmount(context.amount, 'Base USDC status')),
        currency:
          option?.currency ??
          (context.currency === undefined
            ? undefined
            : normalizeCurrency(context.currency, 'Base USDC status')),
        requiredConfirmations: this.confirmations,
        updatedAt: new Date(),
      };
    }

    const currentBlock = await this.getCurrentBlockNumber();
    const blockNumber = readLogBlockNumber(matchingTransfer.latestLog);
    const confirmations = calculateConfirmations(currentBlock, blockNumber);
    const requiredConfirmations = this.confirmations;
    const receivedAmountAtomic = decimalToMinorUnitAmount(
      matchingTransfer.amountAtomic,
      USDC_DECIMALS,
      'Base USDC received',
    );

    return {
      backendId: this.capabilities.id,
      quoteId: normalizedQuoteId,
      payTo: normalizedPayTo,
      status:
        confirmations >= requiredConfirmations ? 'confirmed' : 'processing',
      settlementCurrency: 'USDC',
      settlementAmount:
        option?.settlementAmount ??
        (context.settlementAmount === undefined
          ? undefined
          : normalizeMinorUnitAmount(
              context.settlementAmount,
              'Base USDC settlement status',
            )),
      receivedAmount: receivedAmountAtomic,
      amount:
        option?.amount ??
        (context.amount === undefined
          ? undefined
          : normalizeMinorUnitAmount(context.amount, 'Base USDC status')),
      currency:
        option?.currency ??
        (context.currency === undefined
          ? undefined
          : normalizeCurrency(context.currency, 'Base USDC status')),
      requiredConfirmations,
      confirmations,
      transactionId: matchingTransfer.latestLog.transactionHash,
      updatedAt: new Date(),
      raw: matchingTransfer.latestLog,
    };
  }

  async verifyX402Proof(
    input: VerifyX402ProofInput,
  ): Promise<X402VerificationResult> {
    const quoteId = normalizeNonEmptyString(input.quoteId, 'Base USDC quoteId');
    let payload: unknown;

    try {
      payload = decodePaymentHeader(input.paymentHeader);
    } catch (error) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: input.payTo,
        reason: 'x402 payment header could not be decoded.',
        raw: {
          paymentHeader: input.paymentHeader,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const transactionId = readX402PayloadString(payload, [
      'transactionHash',
      'txHash',
      'tx',
      'hash',
    ])?.trim();

    if (this.x402FacilitatorUrl) {
      return this.verifyWithFacilitator(input, payload);
    }

    if (!transactionId) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: input.payTo,
        reason:
          'x402 proof did not include a transaction hash and no facilitator URL is configured.',
        raw: payload,
      };
    }

    if (!isEvmTransactionHash(transactionId)) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: input.payTo,
        transactionId,
        reason: 'x402 proof transaction hash was invalid.',
        raw: payload,
      };
    }

    const requirementError = validateX402PayloadRequirements(payload, input);

    if (requirementError) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: input.payTo,
        transactionId,
        reason: requirementError,
        raw: payload,
      };
    }

    const expectedAmountAtomic = amountToUsdcAtomicUnits(
      normalizePositiveMinorUnitAmount(input.amount, 'Base USDC x402 amount'),
      normalizeCurrency(input.currency, 'Base USDC x402'),
      'Base USDC x402 amount',
    );

    return this.verifyX402Receipt(
      input,
      payload,
      quoteId,
      transactionId,
      expectedAmountAtomic,
    );
  }

  async sendPayout(input: SendPayoutInput): Promise<PayoutResult> {
    if (input.currency !== undefined) {
      const currency = normalizeNonEmptyString(
        input.currency,
        'Base USDC payout currency',
      );

      if (currency.toUpperCase() !== 'USDC') {
        throw new PaymentConfigurationError(
          `BaseUsdcAdapter can only send USDC payouts, received ${input.currency}.`,
        );
      }
    }

    if (!this.options.sendTransaction) {
      throw new PaymentConfigurationError(
        'BaseUsdcAdapter sendPayout requires a sendTransaction callback.',
      );
    }

    const amount = normalizePositiveMinorUnitAmount(
      input.amount,
      'Base USDC payout amount',
    );
    const amountAtomic = String(amount);
    const destination = normalizeAddress(input.destination);
    const quoteId =
      input.quoteId === undefined
        ? undefined
        : normalizeNonEmptyString(input.quoteId, 'Base USDC payout quoteId');
    const idempotencyKey =
      input.idempotencyKey === undefined
        ? undefined
        : normalizeNonEmptyString(
            input.idempotencyKey,
            'Base USDC payout idempotencyKey',
          );
    const result = await this.options.sendTransaction({
      destination,
      amount,
      amountAtomic,
      currency: 'USDC',
      tokenAddress: this.usdcContractAddress,
      memo: input.memo,
      quoteId,
      idempotencyKey,
      metadata: input.metadata,
    });

    return {
      backendId: this.capabilities.id,
      status: 'submitted',
      transactionId: result.transactionId,
      destination,
      amount,
      currency: 'USDC',
      raw: result.raw,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    if (input.currency !== undefined) {
      const currency = normalizeNonEmptyString(
        input.currency,
        'Base USDC refund currency',
      );

      if (currency.toUpperCase() !== 'USDC') {
        throw new PaymentConfigurationError(
          `BaseUsdcAdapter refunds require USDC currency when specified, received ${input.currency}.`,
        );
      }
    }

    if (!input.destination) {
      throw new PaymentConfigurationError(
        'Base USDC refunds require a destination payer address.',
      );
    }

    if (input.amount === undefined) {
      throw new PaymentConfigurationError(
        'Base USDC refunds require an amount.',
      );
    }

    const payout = await this.sendPayout({
      destination: input.destination,
      amount: input.amount,
      currency: 'USDC',
      idempotencyKey: input.idempotencyKey,
      memo: input.reason,
      metadata: input.metadata,
    });

    return {
      backendId: this.capabilities.id,
      status: 'submitted',
      transactionId: payout.transactionId,
      amount: payout.amount,
      currency: payout.currency,
      raw: payout.raw,
    };
  }

  private async deriveAddress(
    input: BaseUsdcAddressDeriverInput,
  ): Promise<string> {
    if (this.options.addressDeriver) {
      return this.options.addressDeriver(input);
    }

    if (!this.masterXpub) {
      throw new PaymentConfigurationError(
        'BaseUsdcAdapter requires masterXpub or addressDeriver.',
      );
    }

    return deriveBaseUsdcAddress({
      masterXpub: this.masterXpub,
      path: input.path,
    });
  }

  private async getTransferLogs(
    payTo: string,
    requiredFromBlock?: bigint,
  ): Promise<RpcLog[]> {
    const fromBlock =
      this.configuredFromBlock ??
      (await this.getDefaultFromBlock(requiredFromBlock));
    const logs = await this.rpc<unknown>('eth_getLogs', [
      {
        address: this.usdcContractAddress,
        fromBlock,
        toBlock: 'latest',
        topics: [TRANSFER_TOPIC, null, addressToTopic(payTo)],
      },
    ]);

    return Array.isArray(logs) ? (logs as RpcLog[]) : [];
  }

  private async getDefaultFromBlock(
    requiredFromBlock?: bigint,
  ): Promise<string> {
    const currentBlock = await this.getCurrentBlockNumber();
    const lookbackStartBlock =
      currentBlock > DEFAULT_LOG_LOOKBACK_BLOCKS
        ? currentBlock - DEFAULT_LOG_LOOKBACK_BLOCKS
        : 0n;
    const startBlock = requiredFromBlock ?? lookbackStartBlock;

    return toHexQuantity(startBlock);
  }

  private async getCurrentBlockNumber(): Promise<bigint> {
    return parseHexQuantity(await this.rpc<string>('eth_blockNumber', []));
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await this.fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++this.rpcId,
        method,
        params,
      }),
    });
    const json = await readJsonResponse<JsonRpcResponse<T>>(
      response,
      `Base RPC ${method}`,
    );

    if (json.error) {
      throw new PaymentProviderError(
        `Base RPC ${method}: ${json.error.message}`,
        { retryable: json.error.code === -32005 },
      );
    }

    return json.result as T;
  }

  private async verifyX402Receipt(
    input: VerifyX402ProofInput,
    payload: unknown,
    quoteId: string,
    transactionId: string,
    expectedAmountAtomic: string,
    extraRaw?: Record<string, unknown>,
  ): Promise<X402VerificationResult> {
    if (this.seenX402TransactionIds.has(transactionId)) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: input.payTo,
        transactionId,
        reason: 'x402 transaction has already been verified.',
        raw: { ...extraRaw, payload },
      };
    }

    this.seenX402TransactionIds.add(transactionId);
    let keepReplayMarker = false;

    try {
      const receipt = await this.rpc<RpcReceipt | null>(
        'eth_getTransactionReceipt',
        [transactionId],
      );
      const raw = { ...extraRaw, payload, receipt };

      if (!receipt) {
        return {
          valid: false,
          backendId: this.capabilities.id,
          quoteId,
          payTo: input.payTo,
          transactionId,
          reason: 'x402 transaction receipt is not available yet.',
          raw,
        };
      }

      if (receipt.status !== '0x1') {
        return {
          valid: false,
          backendId: this.capabilities.id,
          quoteId,
          payTo: input.payTo,
          transactionId,
          reason: 'x402 transaction failed onchain.',
          raw,
        };
      }

      const blockNumber = parseHexQuantity(receipt.blockNumber ?? '0x0');
      const currentBlock =
        blockNumber > 0n ? await this.getCurrentBlockNumber() : 0n;
      const confirmations = calculateConfirmations(currentBlock, blockNumber);

      if (confirmations < this.confirmations) {
        return {
          valid: false,
          backendId: this.capabilities.id,
          quoteId,
          payTo: input.payTo,
          transactionId,
          reason: `x402 transaction has ${confirmations} confirmations; ${this.confirmations} required.`,
          raw,
        };
      }

      const receiptLogs = Array.isArray(receipt.logs) ? receipt.logs : [];
      const matchingLog = pickBestTransferLog(
        receiptLogs.filter(
          (log) =>
            isRecord(log) &&
            safeNormalizeAddress(log.address) === this.usdcContractAddress,
        ) as RpcLog[],
        expectedAmountAtomic,
        input.payTo,
        'exact',
      );

      if (!matchingLog) {
        return {
          valid: false,
          backendId: this.capabilities.id,
          quoteId,
          payTo: input.payTo,
          transactionId,
          reason: 'No exact USDC transfer matching the x402 proof.',
          raw,
        };
      }

      keepReplayMarker = true;
      trimSeenX402TransactionIds(this.seenX402TransactionIds);

      return {
        valid: true,
        backendId: this.capabilities.id,
        quoteId,
        payTo: normalizeAddress(input.payTo),
        transactionId,
        payer: parseTransferLog(matchingLog)?.from,
        amount: decimalToMinorUnitAmount(
          parseHexQuantity(matchingLog.data),
          USDC_DECIMALS,
          'Base USDC x402 amount',
        ),
        currency: 'USDC',
        network: input.network ?? BASE_MAINNET_CAIP2,
        raw,
      };
    } finally {
      if (!keepReplayMarker) {
        this.seenX402TransactionIds.delete(transactionId);
      }
    }
  }

  private async verifyWithFacilitator(
    input: VerifyX402ProofInput,
    payload: unknown,
  ): Promise<X402VerificationResult> {
    const quoteId = normalizeNonEmptyString(input.quoteId, 'Base USDC quoteId');

    if (!this.x402FacilitatorUrl) {
      throw new PaymentVerificationError('x402 facilitator URL is missing.');
    }

    const maxAmountRequired = amountToUsdcAtomicUnits(
      normalizePositiveMinorUnitAmount(input.amount, 'Base USDC x402 amount'),
      normalizeCurrency(input.currency, 'Base USDC x402'),
      'Base USDC x402 amount',
    );
    const response = await this.fetch(`${this.x402FacilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: {
          scheme: input.scheme ?? 'exact',
          network: input.network ?? BASE_MAINNET_CAIP2,
          asset: this.usdcContractAddress,
          payTo: normalizeAddress(input.payTo),
          maxAmountRequired,
          resource: input.resource,
          method: input.method,
        },
      }),
    });
    const json = await readJsonResponse<Record<string, unknown>>(
      response,
      'x402 facilitator verify',
    );
    const valid = readBoolean(json, 'valid') ?? readBoolean(json, 'isValid');
    const transactionId = findNestedString(json, [
      'transactionHash',
      'txHash',
    ])?.trim();

    if (valid !== true) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: normalizeAddress(input.payTo),
        transactionId,
        network: input.network ?? BASE_MAINNET_CAIP2,
        reason: String(json.reason ?? 'facilitator rejected'),
        raw: json,
      };
    }

    if (!transactionId) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: normalizeAddress(input.payTo),
        network: input.network ?? BASE_MAINNET_CAIP2,
        reason: 'x402 facilitator did not return a transaction hash.',
        raw: json,
      };
    }

    if (!isEvmTransactionHash(transactionId)) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: normalizeAddress(input.payTo),
        transactionId,
        network: input.network ?? BASE_MAINNET_CAIP2,
        reason: 'x402 facilitator transaction hash was invalid.',
        raw: json,
      };
    }

    const requirementError = validateX402PayloadRequirements(payload, input);

    if (requirementError) {
      return {
        valid: false,
        backendId: this.capabilities.id,
        quoteId,
        payTo: normalizeAddress(input.payTo),
        transactionId,
        network: input.network ?? BASE_MAINNET_CAIP2,
        reason: requirementError,
        raw: json,
      };
    }

    return this.verifyX402Receipt(
      input,
      payload,
      quoteId,
      transactionId,
      maxAmountRequired,
      { facilitator: json },
    );
  }
}

export async function deriveBaseUsdcAddress(input: {
  masterXpub: string;
  path: string;
}): Promise<string> {
  const masterXpub = normalizeNonEmptyString(
    input.masterXpub,
    'Base USDC masterXpub',
  );
  const path = normalizeNonEmptyString(input.path, 'Base USDC derivation path');

  try {
    const [{ HDKey }, { secp256k1 }, { keccak_256 }] = await Promise.all([
      import('@scure/bip32'),
      import('@noble/curves/secp256k1.js'),
      import('@noble/hashes/sha3.js'),
    ]);
    const root = HDKey.fromExtendedKey(masterXpub);
    const child = root.derive(path);

    if (!child.publicKey) {
      throw new PaymentConfigurationError(`No public key derived for ${path}.`);
    }

    const point = secp256k1.Point.fromBytes(child.publicKey);
    const { x, y } = point.toAffine();
    const publicKey = concatBytes(bigintToFixedBytes(x), bigintToFixedBytes(y));
    const hash = keccak_256(publicKey);

    return `0x${bytesToHex(hash.slice(-20))}`;
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      throw error;
    }

    throw new PaymentConfigurationError(
      'BIP32 xpub address derivation requires @scure/bip32, @noble/curves, and @noble/hashes.',
      { cause: error },
    );
  }
}

export function quoteIdToDerivationIndex(quoteId: string): number {
  return quoteIdToDerivationIndexes(quoteId)[0] ?? 0;
}

export function quoteIdToDerivationIndexes(quoteId: string): number[] {
  const normalizedQuoteId = normalizeNonEmptyString(
    quoteId,
    'Base USDC quoteId',
  );
  const hash = createHash('sha256').update(normalizedQuoteId).digest();
  return [0, 4, 8, 12].map((offset) => hash.readUInt32BE(offset) & 0x7fffffff);
}

function normalizeDerivationIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) {
    throw new PaymentConfigurationError(
      `BaseUsdcAdapter addressIndexForQuote must return a non-hardened BIP32 child index, received ${String(index)}.`,
    );
  }

  return index;
}

function normalizeDerivationPathPrefix(value: string): string {
  if (typeof value !== 'string') {
    throw new PaymentConfigurationError(
      'BaseUsdcAdapter derivationPathPrefix must be a string.',
    );
  }

  const normalized = value.trim().replace(/\/+$/, '');

  if (!normalized) {
    throw new PaymentConfigurationError(
      'BaseUsdcAdapter derivationPathPrefix must not be empty when configured.',
    );
  }

  return normalized;
}

function normalizeConfirmationCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PaymentConfigurationError(
      `${label} must be a non-negative integer, received ${String(value)}.`,
    );
  }

  return value;
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const item = value[key];

  return typeof item === 'boolean' ? item : undefined;
}

function normalizeFromBlock(value: string | number | bigint): string {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new PaymentConfigurationError(
        `BaseUsdcAdapter fromBlock must be a non-negative JSON-RPC block tag or quantity, received ${String(value)}.`,
      );
    }

    return toHexQuantity(value);
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new PaymentConfigurationError(
        `BaseUsdcAdapter fromBlock must be a non-negative JSON-RPC block tag or quantity, received ${String(value)}.`,
      );
    }

    return toHexQuantity(BigInt(value));
  }

  if (typeof value !== 'string') {
    throw new PaymentConfigurationError(
      `BaseUsdcAdapter fromBlock must be a non-negative JSON-RPC block tag or quantity, received ${String(value)}.`,
    );
  }

  const normalized = value.trim();

  if (['earliest', 'latest', 'pending'].includes(normalized)) {
    return normalized;
  }

  if (/^0x[0-9a-fA-F]+$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  throw new PaymentConfigurationError(
    `BaseUsdcAdapter fromBlock must be a non-negative JSON-RPC block tag or quantity, received ${String(value)}.`,
  );
}

function configuredFromBlockMinBlock(value: string | undefined): bigint {
  if (
    value === undefined ||
    ['earliest', 'latest', 'pending'].includes(value)
  ) {
    return 0n;
  }

  return parseHexQuantity(value);
}

function calculateConfirmations(
  currentBlock: bigint,
  blockNumber: bigint,
): number {
  if (blockNumber <= 0n || currentBlock < blockNumber) {
    return 0;
  }

  const confirmations = currentBlock - blockNumber + 1n;

  return confirmations > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(confirmations);
}

function resolveExpectedUsdcAmount(
  option: StoredBaseOption | undefined,
  context: PaymentStatusContext,
): string | undefined {
  if (option) {
    return option.expectedAmountAtomic;
  }

  if (context.settlementAmount !== undefined) {
    return String(
      normalizePositiveMinorUnitAmount(
        context.settlementAmount,
        'Base USDC expected amount',
      ),
    );
  }

  if (context.amount === undefined || context.currency === undefined) {
    return undefined;
  }

  return amountToUsdcAtomicUnits(
    normalizePositiveMinorUnitAmount(
      context.amount,
      'Base USDC expected amount',
    ),
    normalizeCurrency(context.currency, 'Base USDC expected amount'),
    'Base USDC expected amount',
  );
}

function amountToUsdcAtomicUnits(
  amount: number,
  currency: string,
  context: string,
): string {
  const normalizedCurrency = normalizeCurrency(currency, context);

  if (!['USD', 'USDC'].includes(normalizedCurrency)) {
    throw new PaymentConfigurationError(
      `${context} currency must be USD or USDC for Base USDC settlement, received ${currency}.`,
    );
  }

  const decimalAmount = minorUnitsToDecimal(
    amount,
    currencyMinorUnitDecimals(normalizedCurrency),
  );

  return decimalToAtomicUnits(decimalAmount, USDC_DECIMALS);
}

function pickBestTransferLog(
  logs: RpcLog[],
  expectedAmountAtomic: string,
  payTo?: string,
  comparison: 'atLeast' | 'exact' = 'atLeast',
  minBlockNumber = 0n,
): RpcLog | undefined {
  const expected = BigInt(expectedAmountAtomic);

  return logs.find((log) => {
    const transfer = parseTransferLog(log);

    if (!transfer || log.removed) {
      return false;
    }

    if (readLogBlockNumber(log) < minBlockNumber) {
      return false;
    }

    if (payTo && transfer.to !== normalizeAddress(payTo)) {
      return false;
    }

    return comparison === 'exact'
      ? transfer.amountAtomic === expected
      : transfer.amountAtomic >= expected;
  });
}

function pickSingleTransferMatch(
  logs: RpcLog[],
  expectedAmountAtomic: string,
  payTo?: string,
  minBlockNumber = 0n,
): { amountAtomic: bigint; latestLog: RpcLog } | undefined {
  const log = pickBestTransferLog(
    logs,
    expectedAmountAtomic,
    payTo,
    'atLeast',
    minBlockNumber,
  );
  const transfer = log ? parseTransferLog(log) : undefined;

  return log && transfer
    ? { amountAtomic: transfer.amountAtomic, latestLog: log }
    : undefined;
}

function pickCumulativeTransferMatch(
  logs: RpcLog[],
  expectedAmountAtomic: string,
  payTo?: string,
  minBlockNumber = 0n,
): { amountAtomic: bigint; latestLog: RpcLog } | undefined {
  const expected = BigInt(expectedAmountAtomic);
  const matched = logs
    .map((log) => ({
      log,
      transfer: parseTransferLog(log),
    }))
    .filter(
      (
        item,
      ): item is {
        log: RpcLog;
        transfer: { from: string; to: string; amountAtomic: bigint };
      } => {
        if (!item.transfer || item.log.removed) {
          return false;
        }

        if (readLogBlockNumber(item.log) < minBlockNumber) {
          return false;
        }

        return payTo ? item.transfer.to === normalizeAddress(payTo) : true;
      },
    );

  const byPayer = new Map<
    string,
    { amountAtomic: bigint; latestLog: RpcLog }
  >();

  for (const item of matched) {
    const existing = byPayer.get(item.transfer.from);
    const latestLog =
      existing && compareTransferLogs(existing.latestLog, item.log) >= 0
        ? existing.latestLog
        : item.log;

    byPayer.set(item.transfer.from, {
      amountAtomic: (existing?.amountAtomic ?? 0n) + item.transfer.amountAtomic,
      latestLog,
    });
  }

  const candidates = [...byPayer.values()].filter(
    (item) => item.amountAtomic >= expected,
  );

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.reduce((current, item) =>
    compareTransferLogs(item.latestLog, current.latestLog) > 0 ? item : current,
  );
}

function parseTransferLog(
  log: RpcLog,
): { from: string; to: string; amountAtomic: bigint } | undefined {
  if (
    !isRecord(log) ||
    !Array.isArray(log.topics) ||
    typeof log.data !== 'string'
  ) {
    return undefined;
  }

  if (
    log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC ||
    log.topics.length < 3
  ) {
    return undefined;
  }

  try {
    return {
      from: topicToAddress(log.topics[1] ?? ''),
      to: topicToAddress(log.topics[2] ?? ''),
      amountAtomic: parseHexQuantity(log.data),
    };
  } catch {
    return undefined;
  }
}

function readLogBlockNumber(log: RpcLog): bigint {
  try {
    return parseHexQuantity(log.blockNumber ?? '0x0');
  } catch {
    return 0n;
  }
}

function compareTransferLogs(left: RpcLog, right: RpcLog): number {
  const leftBlock = readLogBlockNumber(left);
  const rightBlock = readLogBlockNumber(right);

  if (leftBlock > rightBlock) {
    return 1;
  }

  if (leftBlock < rightBlock) {
    return -1;
  }

  return (left.transactionHash ?? '')
    .toLowerCase()
    .localeCompare((right.transactionHash ?? '').toLowerCase());
}

function trimSeenX402TransactionIds(seenTransactionIds: Set<string>): void {
  while (seenTransactionIds.size > DEFAULT_MAX_SEEN_X402_TRANSACTION_IDS) {
    const oldest = seenTransactionIds.values().next().value;

    if (oldest === undefined) {
      break;
    }

    seenTransactionIds.delete(oldest);
  }
}

function buildUsdcPaymentUri(input: {
  tokenAddress: string;
  payTo: string;
  amountAtomic: string;
}): string {
  return `ethereum:${input.tokenAddress}@${BASE_MAINNET_CHAIN_ID}/transfer?address=${input.payTo}&uint256=${input.amountAtomic}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAddress(address: string): string {
  if (typeof address !== 'string') {
    throw new PaymentConfigurationError(
      `Invalid EVM address: ${String(address)}`,
    );
  }

  const normalized = address.trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new PaymentConfigurationError(`Invalid EVM address: ${address}`);
  }

  return normalized.toLowerCase();
}

function isEvmTransactionHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function safeNormalizeAddress(address: unknown): string | undefined {
  try {
    return normalizeAddress(address as string);
  } catch {
    return undefined;
  }
}

function addressToTopic(address: string): string {
  return `0x${normalizeAddress(address).slice(2).padStart(64, '0')}`;
}

function topicToAddress(topic: string): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(topic)) {
    throw new PaymentProviderError(`Invalid EVM address topic: ${topic}`);
  }

  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function parseHexQuantity(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new PaymentProviderError(
        `Invalid JSON-RPC hex quantity: ${String(value)}`,
      );
    }

    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new PaymentProviderError(
        `Invalid JSON-RPC hex quantity: ${String(value)}`,
      );
    }

    return BigInt(value);
  }

  if (typeof value !== 'string') {
    throw new PaymentProviderError(
      `Invalid JSON-RPC hex quantity: ${String(value)}`,
    );
  }

  const normalized = value.trim();

  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
    throw new PaymentProviderError(
      `Invalid JSON-RPC hex quantity: ${String(value)}`,
    );
  }

  return BigInt(normalized);
}

function toHexQuantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function decodePaymentHeader(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.length > 65_536) {
    throw new PaymentVerificationError('x402 payment header is too large.');
  }

  const decoded = trimmed.startsWith('{')
    ? JSON.parse(trimmed)
    : JSON.parse(
        Buffer.from(
          trimmed
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(trimmed.length + ((4 - (trimmed.length % 4)) % 4), '='),
          'base64',
        ).toString('utf8'),
      );

  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new PaymentVerificationError(
      'x402 payment header must be an object.',
    );
  }

  return decoded;
}

function validateX402PayloadRequirements(
  payload: unknown,
  input: VerifyX402ProofInput,
): string | undefined {
  const expectedScheme = input.scheme ?? 'exact';
  const actualScheme = readX402PayloadString(payload, ['scheme']);

  if (!actualScheme) {
    return 'x402 proof did not include the payment scheme.';
  }

  if (actualScheme && actualScheme !== expectedScheme) {
    return `x402 proof scheme ${actualScheme} did not match ${expectedScheme}.`;
  }

  const expectedNetwork = normalizeX402Network(
    input.network ?? BASE_MAINNET_CAIP2,
  );
  const actualNetwork = normalizeX402Network(
    readX402PayloadString(payload, ['network', 'networkId']),
  );

  if (!actualNetwork) {
    return 'x402 proof did not include the payment network.';
  }

  if (actualNetwork && actualNetwork !== expectedNetwork) {
    return `x402 proof network ${actualNetwork} did not match ${expectedNetwork}.`;
  }

  const expectedResource = input.resource;

  if (expectedResource !== undefined) {
    const actualResource = readX402PayloadString(payload, ['resource']);

    if (!actualResource) {
      return 'x402 proof did not include the paid resource.';
    }

    if (actualResource !== expectedResource) {
      return 'x402 proof resource did not match the requested resource.';
    }
  }

  const expectedMethod = input.method;

  if (expectedMethod !== undefined) {
    const actualMethod = readX402PayloadString(payload, ['method']);

    if (!actualMethod) {
      return 'x402 proof did not include the HTTP method.';
    }

    if (actualMethod.toUpperCase() !== expectedMethod.toUpperCase()) {
      return 'x402 proof method did not match the requested method.';
    }
  }

  const actualExpiry = readX402PayloadString(payload, [
    'expiresAt',
    'expires',
    'validBefore',
    'deadline',
  ]);
  const actualExpiryDate =
    actualExpiry === undefined ? undefined : parseX402ExpiryDate(actualExpiry);

  if (actualExpiry !== undefined && !actualExpiryDate) {
    return 'x402 proof expiry was invalid.';
  }

  if (actualExpiryDate !== undefined && actualExpiryDate < new Date()) {
    return 'x402 proof is expired.';
  }

  if (input.expiresAt !== undefined) {
    const expectedExpiry = normalizeDate(input.expiresAt);

    if (expectedExpiry < new Date()) {
      return 'x402 proof is expired.';
    }

    if (!actualExpiry) {
      return 'x402 proof did not include an expiry.';
    }

    if (actualExpiryDate?.getTime() !== expectedExpiry.getTime()) {
      return 'x402 proof expiry did not match the requested expiry.';
    }
  }

  return undefined;
}

function parseX402ExpiryDate(value: string): Date | undefined {
  try {
    if (/^\d+$/.test(value)) {
      const timestamp = Number(value);

      if (!Number.isSafeInteger(timestamp)) {
        return undefined;
      }

      const date = new Date(
        timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp,
      );

      return Number.isNaN(date.getTime()) ? undefined : date;
    }

    return normalizeDate(value);
  } catch {
    return undefined;
  }
}

function normalizeX402Network(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (['base', 'base-mainnet', BASE_MAINNET_CAIP2].includes(normalized)) {
    return BASE_MAINNET_CAIP2;
  }

  return value;
}

function readX402PayloadString(
  value: unknown,
  keys: string[],
): string | undefined {
  const root = asRecord(value);
  const nestedPayload = asRecord(root?.payload);
  const authorization = asRecord(nestedPayload?.authorization);

  for (const key of keys) {
    const authorized = readLooseString(authorization, key);

    if (authorized) {
      return authorized;
    }

    const nested = readLooseString(nestedPayload, key);

    if (nested) {
      return nested;
    }

    const direct = readLooseString(root, key);

    if (direct) {
      return direct;
    }
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readLooseString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const item = value?.[key];

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item === 'number') {
    return String(item);
  }

  return undefined;
}

function findNestedString(
  value: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (!value || typeof value !== 'object' || depth > 16) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }

    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return String(direct);
    }
  }

  for (const child of Object.values(record)) {
    const match = findNestedString(child, keys, depth + 1);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function bigintToFixedBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

function concatBytes(...values: Uint8Array[]): Uint8Array {
  const totalLength = values.reduce((sum, value) => sum + value.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }

  return result;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function hexToBytes(value: string): Uint8Array {
  const bytes = value.match(/.{1,2}/g) ?? [];
  return Uint8Array.from(bytes.map((byte) => Number.parseInt(byte, 16)));
}
