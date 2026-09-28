/**
 * Per-deployment memory for the Rix API dialects that can only be discovered by
 * asking.
 *
 * The two Rix API generations share a core version string but differ in endpoint
 * sets: verified 2026-09-26 on two deployments reporting `rix_version_message:
 * "6.5.17"` — one answers `GET /api/user/token` and one removed it — so the
 * dialect is probed once per deployment and remembered for the rest of the
 * session instead of being guessed from the version. A remembered choice is only
 * a preference: when it stops answering, the other candidates are retried and the
 * winner replaces the memory.
 * Source: https://github.com/RixAPI/Rix-API.
 */

/** Probeable dialect decisions, one independent memory per deployment. */
export const RIX_API_DIALECT_KEYS = {
  /** Endpoint family that answers the token group list. */
  TokenGroups: "token-groups",
  /** Auth mode the account model list accepts. */
  ModelListAuth: "model-list-auth",
  /** Auth mode the pricing endpoint accepts. */
  PricingAuth: "pricing-auth",
} as const

export type RixApiDialectKey =
  (typeof RIX_API_DIALECT_KEYS)[keyof typeof RIX_API_DIALECT_KEYS]

/** Bounds one session's memory of distinct deployments. */
const RIX_API_DIALECT_CACHE_MAX_ENTRIES = 100

const dialectChoices = new Map<string, Map<RixApiDialectKey, string>>()

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, "")

const readChoice = (
  baseUrl: string,
  key: RixApiDialectKey,
): string | undefined => dialectChoices.get(normalizeBaseUrl(baseUrl))?.get(key)

const rememberChoice = (
  baseUrl: string,
  key: RixApiDialectKey,
  choice: string,
) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const remembered = dialectChoices.get(normalizedBaseUrl)

  if (remembered) {
    remembered.set(key, choice)
    // Re-insert so the least recently updated deployment is evicted first.
    dialectChoices.delete(normalizedBaseUrl)
    dialectChoices.set(normalizedBaseUrl, remembered)
  } else {
    dialectChoices.set(normalizedBaseUrl, new Map([[key, choice]]))
  }

  while (dialectChoices.size > RIX_API_DIALECT_CACHE_MAX_ENTRIES) {
    const oldestKey = dialectChoices.keys().next().value
    if (typeof oldestKey !== "string") return
    dialectChoices.delete(oldestKey)
  }
}

/**
 * Resolves one dialect choice by trying the candidates in preference order.
 *
 * The last failure is rethrown when no candidate answers.
 * @param baseUrl Deployment the choice belongs to.
 * @param key Which dialect is being resolved.
 * @param candidates Candidate choices, most preferred first.
 * @param attempt Attempts one candidate, throwing when it does not answer.
 * @returns The first candidate that answered, remembered for later calls.
 */
export async function resolveRixApiDialect<T>(
  baseUrl: string,
  key: RixApiDialectKey,
  candidates: readonly string[],
  attempt: (candidate: string) => Promise<T>,
): Promise<T> {
  const remembered = readChoice(baseUrl, key)
  const orderedCandidates =
    remembered && candidates.includes(remembered)
      ? [
          remembered,
          ...candidates.filter((candidate) => candidate !== remembered),
        ]
      : [...candidates]

  let lastError: unknown
  for (const candidate of orderedCandidates) {
    try {
      const result = await attempt(candidate)
      rememberChoice(baseUrl, key, candidate)
      return result
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

/**
 * Read the Rix API core version major from the public status payload.
 *
 * Rix API reports its core version next to the deployment's own build number,
 * and that core version selects the console layout of that generation:
 * https://github.com/RixAPI/Rix-API. The older generation keeps the paths the
 * site definition already declares, so an unparsable or absent value stays on
 * those.
 */
export function readRixApiMajorVersion(
  status: { rix_version_message?: string } | null,
): number | undefined {
  const rawVersion = status?.rix_version_message
  if (typeof rawVersion !== "string") return undefined

  const versionMatch = rawVersion.trim().match(/^\d+/)
  if (!versionMatch) return undefined

  const major = Number.parseInt(versionMatch[0], 10)
  return Number.isSafeInteger(major) ? major : undefined
}

/** First Rix API core version whose console and tokens use the 6.x dialect. */
export const RIX_API_V6_MIN_MAJOR_VERSION = 6

const majorVersions = new Map<string, number>()

/** Record the probed Rix API core major version for a deployment base URL. */
export function recordRixApiMajorVersion(
  baseUrl: string,
  majorVersion: number | undefined,
): void {
  const normalized = normalizeBaseUrl(baseUrl)
  if (majorVersion === undefined) {
    majorVersions.delete(normalized)
  } else {
    majorVersions.set(normalized, majorVersion)
  }
}

/** Resolve the recorded Rix API core major version for a deployment. */
export function resolveRixApiMajorVersion(
  baseUrl: string | undefined,
): number | undefined {
  if (!baseUrl) return undefined
  return majorVersions.get(normalizeBaseUrl(baseUrl))
}

/**
 * Whether a deployment is known to own the token columns Rix API 6.x added: the
 * call-count quota, the IP deny list, the media storage node and the group pin.
 *
 * A deployment that has not been probed yet, and one that reports no core
 * version, keep the newer columns: hiding a column the deployment does own is
 * worse than showing one it ignores, and a write never sends a column the row
 * did not carry. A probed older generation drops them.
 */
export function reportsRixApiV6TokenColumns(
  baseUrl: string | undefined,
): boolean {
  const majorVersion = resolveRixApiMajorVersion(baseUrl)
  return (
    majorVersion === undefined || majorVersion >= RIX_API_V6_MIN_MAJOR_VERSION
  )
}

/** Clears every remembered dialect choice between unit tests. */
export function clearRixApiDialectChoicesForTests() {
  dialectChoices.clear()
  majorVersions.clear()
}
