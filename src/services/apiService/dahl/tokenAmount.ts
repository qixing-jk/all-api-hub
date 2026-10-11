/** Parse exact whole-token amounts, including the native K/M shorthand. */
export function parseDahlTokenAmount(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = value
    .trim()
    .replace(",", ".")
    .match(/^(\d+(?:\.\d+)?)\s*([KM])?$/i)
  const decimal = match?.[1]
  if (!match || !decimal) return null
  const decimalShift =
    match[2]?.toUpperCase() === "M"
      ? 6
      : match[2]?.toUpperCase() === "K"
        ? 3
        : 0
  const [whole, fraction = ""] = decimal.split(".")
  // Shift decimal digits before conversion so valid amounts such as 1.001K
  // do not lose a token to floating-point multiplication or round a fraction up.
  if (/[1-9]/.test(fraction.slice(decimalShift))) return null
  const amount = Number(
    whole + fraction.slice(0, decimalShift).padEnd(decimalShift, "0"),
  )
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}
