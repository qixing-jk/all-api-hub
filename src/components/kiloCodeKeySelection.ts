import {
  getAccountRuntimeKeyExportId,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"

/**
 * Normalizes the creation timestamp used when choosing the newest token after refresh.
 */
function resolveTokenCreatedAt(key: AccountRuntimeKey): number | null {
  return typeof key.createdAt === "number" && Number.isFinite(key.createdAt)
    ? key.createdAt
    : null
}

/**
 * Selects the newest token deterministically even when upstream fetch order is unstable.
 */
export function pickNewestKiloCodeRuntimeKey(
  tokens: AccountRuntimeKey[],
): AccountRuntimeKey {
  if (tokens.length === 0) {
    throw new Error("Expected at least one Kilo Code token to select")
  }

  return tokens.reduce((selectedToken, candidateToken) => {
    const selectedCreatedAt = resolveTokenCreatedAt(selectedToken)
    const candidateCreatedAt = resolveTokenCreatedAt(candidateToken)

    if (
      selectedCreatedAt !== null &&
      candidateCreatedAt !== null &&
      selectedCreatedAt !== candidateCreatedAt
    ) {
      return candidateCreatedAt > selectedCreatedAt
        ? candidateToken
        : selectedToken
    }

    if (selectedCreatedAt === null && candidateCreatedAt !== null) {
      return candidateToken
    }

    if (selectedCreatedAt !== null && candidateCreatedAt === null) {
      return selectedToken
    }

    return getAccountRuntimeKeyExportId(candidateToken).localeCompare(
      getAccountRuntimeKeyExportId(selectedToken),
      "en",
      { numeric: true },
    ) > 0
      ? candidateToken
      : selectedToken
  })
}
