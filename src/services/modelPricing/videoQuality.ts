/** Canonicalize resolution notation only; provider quality labels remain exact. */
export function normalizeVideoQuality(value: string): string {
  return /^[1-9]\d*[pk]$/i.test(value) ? value.toLowerCase() : value
}
