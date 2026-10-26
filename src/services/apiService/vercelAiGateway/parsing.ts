/** Optional protocol strings are trimmed; empty and non-string values stay absent. */
export const readVercelString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/** Catalog prices accept finite, non-negative numeric amounts and numeric strings. */
export const readVercelPrice = (value: unknown): number | undefined => {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}
