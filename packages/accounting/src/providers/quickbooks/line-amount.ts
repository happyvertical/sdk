/** ISO 4217 List One, published 2026-09-17. Do not use Intl display digits:
 * ICU differs for e.g. IQD, MGA and RSD, and omits fund codes CLF/UYW.
 * https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
 * N.A., unknown and missing codes cannot authorize currency rounding.
 */
const precisionGroups: readonly (readonly [number, string])[] = [
  [0, 'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF'],
  [
    2,
    'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CNY COP COU CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD USN UYU UZS VED VES WST XAD XCD XCG YER ZAR ZMW ZWG',
  ],
  [3, 'BHD IQD JOD KWD LYD OMR TND'],
  [4, 'CLF UYW'],
];
const currencyPrecision = new Map(
  precisionGroups.flatMap(([precision, codes]) =>
    codes.split(' ').map((code) => [code, precision] as const),
  ),
);

/** Exact decimal interpretation of the finite nonnegative public number value. */
function decimalRatio(value: number): {
  numerator: bigint;
  denominator: bigint;
} {
  const [significand, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = significand.split('.');
  const coefficient = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent);
  return scale >= 0
    ? { numerator: coefficient, denominator: 10n ** BigInt(scale) }
    : { numerator: coefficient * 10n ** BigInt(-scale), denominator: 1n };
}

/** Admit only the exact half-up minor-unit result; never rewrite caller money. */
export function matchesCurrencyRoundedLineAmount(
  quantity: number,
  unitPrice: number,
  amount: number,
  currency: string | undefined,
): boolean {
  if (typeof currency !== 'string') return false;
  const precision = currencyPrecision.get(currency.toUpperCase());
  if (precision === undefined) return false;
  const minorScale = 10n ** BigInt(precision);
  const retained = decimalRatio(amount);
  const retainedMinor = retained.numerator * minorScale;
  // An off-grid caller amount is not permission to round their supplied money.
  if (retainedMinor % retained.denominator !== 0n) return false;
  const qty = decimalRatio(quantity);
  const price = decimalRatio(unitPrice);
  const numerator = qty.numerator * price.numerator * minorScale;
  const denominator = qty.denominator * price.denominator;
  const quotient = numerator / denominator;
  const rounded =
    quotient + ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
  return retainedMinor / retained.denominator === rounded;
}
