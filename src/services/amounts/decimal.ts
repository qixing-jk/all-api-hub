export const DECIMAL_BOUNDS = {
  MaxLength: 256,
  MaxExponent: 100,
} as const

export const DECIMAL_ERRORS = {
  Invalid: "invalid_decimal",
  Overflow: "decimal_overflow",
  InvalidScale: "invalid_decimal_scale",
  InvalidDivisor: "invalid_decimal_divisor",
  NonTerminating: "non_terminating_decimal",
  Underflow: "decimal_underflow",
} as const

/** Bounded exact decimal arithmetic. Numbers already rounded by JSON cannot be recovered. */
export function parseDecimal(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    )
      return undefined
    value = String(value)
  }
  if (typeof value !== "string" || value.length > DECIMAL_BOUNDS.MaxLength)
    return undefined
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(
    value.trim(),
  )
  if (!match) return undefined
  const exponent = Number(match[4] ?? 0)
  if (Math.abs(exponent) > DECIMAL_BOUNDS.MaxExponent) return undefined
  const digits = match[2] + (match[3] ?? "")
  const point = match[2]!.length + exponent
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`
  const [whole, fraction = ""] = expanded.split(".")
  const integral = whole!.replace(/^0+(?=\d)/, "")
  const fractional = fraction.replace(/0+$/, "")
  const absolute = integral + (fractional ? `.${fractional}` : "")
  const normalized = absolute === "0" ? "0" : match[1] + absolute
  return normalized.length <= DECIMAL_BOUNDS.MaxLength ? normalized : undefined
}

/** Decomposes a validated decimal for exact integer arithmetic. */
function parts(value: string) {
  const normalized = parseDecimal(value)
  if (normalized === undefined) throw new Error(DECIMAL_ERRORS.Invalid)
  const [whole, fraction = ""] = normalized.split(".")
  return { integer: BigInt(whole + fraction), scale: fraction.length }
}

/** Serializes an exact result, rejecting values beyond the supported bound. */
function fromParts(integer: bigint, scale: number): string {
  while (scale > 0 && integer % 10n === 0n) {
    integer /= 10n
    scale--
  }
  const negative = integer < 0n
  const digits = (negative ? -integer : integer)
    .toString()
    .padStart(scale + 1, "0")
  const result = parseDecimal(
    `${negative ? "-" : ""}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`,
  )
  if (result === undefined) throw new Error(DECIMAL_ERRORS.Overflow)
  return result
}

/** Aligns decimal places before applying the requested signed operation. */
function combineDecimal(left: string, right: string, sign: bigint): string {
  const a = parts(left),
    b = parts(right)
  const scale = Math.max(a.scale, b.scale)
  return fromParts(
    a.integer * 10n ** BigInt(scale - a.scale) +
      sign * b.integer * 10n ** BigInt(scale - b.scale),
    scale,
  )
}

/** Adds canonical decimals without floating point rounding. */
export function addDecimal(left: string, right: string): string {
  return combineDecimal(left, right, 1n)
}

/** Multiplies canonical decimals exactly before any declared settlement rounding. */
export function multiplyDecimal(left: string, right: string): string {
  const a = parts(left),
    b = parts(right)
  return fromParts(a.integer * b.integer, a.scale + b.scale)
}

/** Floors an exact decimal, including negative values, at the final rounding boundary. */
export function floorDecimal(value: string): string {
  const { integer, scale } = parts(value)
  const divisor = 10n ** BigInt(scale)
  return fromParts(
    integer / divisor - (integer < 0n && integer % divisor !== 0n ? 1n : 0n),
    0,
  )
}

/** Compares exact values without formatting a potentially larger difference. */
export function compareDecimal(left: string, right: string): number {
  const a = parts(left)
  const b = parts(right)
  const scale = Math.max(a.scale, b.scale)
  const first = a.integer * 10n ** BigInt(scale - a.scale)
  const second = b.integer * 10n ** BigInt(scale - b.scale)
  return first < second ? -1 : first > second ? 1 : 0
}

/** Divide at an explicit display precision, rounding halfway values away from zero. */
export function divideDecimal(
  value: string,
  divisor: string,
  fractionalPlaces: number,
): string {
  if (
    !Number.isInteger(fractionalPlaces) ||
    fractionalPlaces < 0 ||
    fractionalPlaces > DECIMAL_BOUNDS.MaxLength
  )
    throw new Error(DECIMAL_ERRORS.InvalidScale)
  const first = parts(value),
    second = parts(divisor)
  if (second.integer <= 0n) throw new Error(DECIMAL_ERRORS.InvalidDivisor)
  const power = fractionalPlaces + second.scale - first.scale
  const numerator = first.integer * (power > 0 ? 10n ** BigInt(power) : 1n)
  const denominator = second.integer * (power < 0 ? 10n ** BigInt(-power) : 1n)
  let quotient = numerator / denominator
  const remainder = numerator % denominator
  if ((remainder < 0n ? -remainder : remainder) * 2n >= denominator)
    quotient += numerator < 0n ? -1n : 1n
  return fromParts(quotient, fractionalPlaces)
}

/** Exact protocol-unit division; non-terminating fractions require an explicit rounding contract. */
export function divideDecimalByInteger(value: string, divisor: number): string {
  if (!Number.isSafeInteger(divisor) || divisor <= 0)
    throw new Error(DECIMAL_ERRORS.InvalidDivisor)
  let remaining = BigInt(divisor),
    twos = 0,
    fives = 0
  while (remaining % 2n === 0n) {
    remaining /= 2n
    twos++
  }
  while (remaining % 5n === 0n) {
    remaining /= 5n
    fives++
  }
  if (remaining !== 1n) throw new Error(DECIMAL_ERRORS.NonTerminating)
  const { integer, scale } = parts(value)
  const places = Math.max(twos, fives)
  return fromParts(
    integer * 2n ** BigInt(places - twos) * 5n ** BigInt(places - fives),
    scale + places,
  )
}

/** Normalize one upstream field without letting an out-of-range result discard independent observations. */
export function normalizeDecimalUnits(
  value: unknown,
  unitsPerAmount: number,
): string | undefined {
  const parsed = parseDecimal(value)
  if (parsed === undefined) return undefined
  try {
    return divideDecimalByInteger(parsed, unitsPerAmount)
  } catch {
    return undefined
  }
}
