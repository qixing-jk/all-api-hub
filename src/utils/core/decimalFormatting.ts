/** Localize a canonical decimal without rounding it through JavaScript Number. */
export function formatExactDecimal(
  value: string,
  locale?: string,
  options: Intl.NumberFormatOptions = {},
): string {
  const [whole, fraction] = value.split(".")
  const integer = BigInt(whole!)
  const formatter = new Intl.NumberFormat(locale, {
    ...options,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const parts = formatter.formatToParts(
    integer === 0n && value.startsWith("-") ? -0 : integer,
  )
  if (fraction) {
    const decimal = new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")!.value
    const digits = new Intl.NumberFormat(locale, { useGrouping: false })
    const localizedFraction = [...fraction]
      .map((digit) => digits.format(Number(digit)))
      .join("")
    const lastInteger =
      parts.length -
      1 -
      [...parts].reverse().findIndex((part) => part.type === "integer")
    parts.splice(
      lastInteger + 1,
      0,
      { type: "decimal", value: decimal },
      { type: "fraction", value: localizedFraction },
    )
  }
  return parts.map((part) => part.value).join("")
}

export type CompactDecimalOptions = Intl.NumberFormatOptions & {
  /** Abbreviate summaries whose integer part exceeds the available digit budget. */
  maximumIntegerDigits?: number
}

/** Round summaries to cents; optional magnitude bounds retain signed tiny values and exact source integers. */
export function formatCompactDecimal(
  value: string,
  locale?: string,
  { maximumIntegerDigits, ...options }: CompactDecimalOptions = {},
): string {
  const negative = value.startsWith("-")
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".")
  const cents =
    BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2))
  const tiny = cents === 0n && /[1-9]/.test(value)
  const rounded = tiny
    ? 1n
    : cents + (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n)
  const integer = rounded / 100n
  if (maximumIntegerDigits && String(integer).length > maximumIntegerDigits) {
    const summaryOptions: Intl.NumberFormatOptions = {
      ...options,
      notation: "compact",
      maximumSignificantDigits: 3,
      minimumFractionDigits: 0,
    }
    const signed = negative ? -integer : integer
    const formatter = new Intl.NumberFormat(locale, summaryOptions)
    const parts = formatter.formatToParts(signed)
    // Intl compact units stop growing (e.g. trillions); extreme values still need a bound.
    const digits = parts
      .filter((part) => part.type === "integer" || part.type === "fraction")
      .reduce((count, part) => count + [...part.value].length, 0)
    return digits > maximumIntegerDigits + 2
      ? new Intl.NumberFormat(locale, {
          ...summaryOptions,
          notation: "scientific",
        }).format(signed)
      : parts.map((part) => part.value).join("")
  }
  const decimals = String(rounded % 100n).padStart(2, "0")
  const displayedFraction =
    options.style === "currency" ? decimals : decimals.replace(/0+$/, "")
  const displayed = `${negative && rounded !== 0n ? "-" : ""}${rounded / 100n}${displayedFraction ? `.${displayedFraction}` : ""}`
  return `${tiny ? (negative ? ">" : "<") : ""}${formatExactDecimal(displayed, locale, options)}`
}
