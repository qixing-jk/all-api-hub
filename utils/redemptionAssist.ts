export function isPossibleRedemptionCode(
  code: string | undefined | null,
): boolean {
  if (!code) return false
  const normalized = code.trim()
  if (normalized.length !== 32) return false
  return /^[a-f0-9]{32}$/i.test(normalized)
}

export function extractRedemptionCodesFromText(text: string): string[] {
  if (!text) return []
  const matches = text.match(/[a-fA-F0-9]{32}/g) || []
  const unique = new Set<string>()
  for (const raw of matches) {
    if (isPossibleRedemptionCode(raw)) {
      unique.add(raw.trim())
    }
  }
  return Array.from(unique)
}
