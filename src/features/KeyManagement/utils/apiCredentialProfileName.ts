/**
 * Build a stable API credential profile name from token and account labels.
 */
export function buildApiCredentialProfileName(params: {
  accountName: string
  fallbackAccountName?: string
  tokenName: string
}) {
  const parts = [
    params.accountName,
    params.fallbackAccountName ?? "",
    params.tokenName,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)

  return parts.join(" - ")
}
