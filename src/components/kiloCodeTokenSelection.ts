import type { ApiToken } from "~/types"

/**
 * Normalizes the creation timestamp used when choosing the newest token after refresh.
 */
function resolveTokenCreatedAt(token: ApiToken): number | null {
  const candidate = token as ApiToken & {
    createdAt?: number | string
    created_at?: number | string
  }
  const rawCreatedAt =
    candidate.createdAt ?? candidate.created_at ?? token.created_time

  if (typeof rawCreatedAt === "number" && Number.isFinite(rawCreatedAt)) {
    return rawCreatedAt
  }

  if (typeof rawCreatedAt === "string") {
    const numeric = Number(rawCreatedAt)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(rawCreatedAt)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

/**
 * Selects the newest token deterministically even when upstream fetch order is unstable.
 */
export function pickNewestKiloCodeToken(tokens: ApiToken[]): ApiToken {
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

    return candidateToken.id > selectedToken.id ? candidateToken : selectedToken
  })
}
