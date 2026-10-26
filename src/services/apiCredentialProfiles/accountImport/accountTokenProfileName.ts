import { normalizeList } from "~/utils/core/string"

/**
 * Build a stable API credential profile name from token and account labels.
 */
export function buildApiCredentialProfileName(params: {
  accountName: string
  fallbackAccountName?: string
  tokenName: string
}) {
  return normalizeList([
    params.accountName,
    params.fallbackAccountName ?? "",
    params.tokenName,
  ]).join(" - ")
}
