import type { DisplaySiteData, SiteAccount } from "~/types"

export const ACCOUNT_DISPLAY_NAME_SEPARATOR = " · "

/**
 * Normalize account name text for duplicate detection and deterministic sorting.
 */
export function normalizeAccountDisplayNamePart(value: string): string {
  if (!value) {
    return ""
  }

  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")
}

/**
 * Collect normalized base-name keys that appear more than once in the full account set.
 */
export function collectDuplicateAccountNameKeys(
  accounts: readonly Pick<SiteAccount, "site_name">[],
): Set<string> {
  const counts = new Map<string, number>()

  for (const account of accounts) {
    const key = normalizeAccountDisplayNamePart(account.site_name ?? "")
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  )
}

/**
 * Format a disambiguated label using the shared separator constant.
 */
export function formatDisambiguatedAccountDisplayName(
  baseName: string,
  username: string,
): string {
  const trimmedUsername = username.trim()
  if (!baseName || !trimmedUsername) {
    return baseName
  }

  return `${baseName}${ACCOUNT_DISPLAY_NAME_SEPARATOR}${trimmedUsername}`
}

/**
 * Resolve the user-facing account name, appending username only for global duplicates.
 */
export function resolveAccountDisplayName(params: {
  baseName: string
  username: string
  duplicateKeys?: ReadonlySet<string>
}): string {
  const { baseName, username, duplicateKeys } = params
  const duplicateKey = normalizeAccountDisplayNamePart(baseName)

  if (!duplicateKeys?.has(duplicateKey) || !username.trim()) {
    return baseName
  }

  return formatDisambiguatedAccountDisplayName(baseName, username)
}

/**
 * Build a stable account-id -> display-name map using the full stored account set.
 */
export function buildAccountDisplayNameMap(
  accounts: readonly SiteAccount[],
): Map<string, string> {
  const duplicateKeys = collectDuplicateAccountNameKeys(accounts)

  return new Map(
    accounts.map((account) => [
      account.id,
      resolveAccountDisplayName({
        baseName: account.site_name,
        username: account.account_info?.username ?? "",
        duplicateKeys,
      }),
    ]),
  )
}

/**
 * Compare account display labels by normalized base name, then normalized
 * username, then raw label, and finally id for deterministic ordering.
 */
export function compareAccountDisplayNames(
  a: Pick<DisplaySiteData, "id" | "name"> & {
    baseName?: string
    username?: string
  },
  b: Pick<DisplaySiteData, "id" | "name"> & {
    baseName?: string
    username?: string
  },
  sortOrder: "asc" | "desc" = "asc",
): number {
  const direction = sortOrder === "asc" ? 1 : -1
  const normalizedBaseComparison = normalizeAccountDisplayNamePart(
    a.baseName ?? a.name,
  ).localeCompare(normalizeAccountDisplayNamePart(b.baseName ?? b.name))

  if (normalizedBaseComparison !== 0) {
    return normalizedBaseComparison * direction
  }

  const normalizedUsernameComparison = normalizeAccountDisplayNamePart(
    a.username ?? "",
  ).localeCompare(normalizeAccountDisplayNamePart(b.username ?? ""))
  if (normalizedUsernameComparison !== 0) {
    return normalizedUsernameComparison * direction
  }

  const rawComparison = a.name.localeCompare(b.name)
  if (rawComparison !== 0) {
    return rawComparison * direction
  }

  return a.id.localeCompare(b.id) * direction
}
