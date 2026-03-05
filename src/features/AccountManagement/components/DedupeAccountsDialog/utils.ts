import type { TFunction } from "i18next"

import type { SiteAccount } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

/**
 * Build a compact, user-facing label for an account without including secrets.
 */
export function getAccountLabel(account: SiteAccount): string {
  const siteName = account.site_name || ""
  const username = account.account_info?.username || ""
  if (!siteName) return username || account.id
  if (!username) return siteName
  return `${siteName} · ${username}`
}

/**
 * Best-effort timestamp formatter that accepts both seconds and milliseconds.
 */
export function formatTimestamp(
  timestamp: number | undefined,
  t: TFunction,
): string {
  return formatLocaleDateTime(timestamp, t("common:labels.notAvailable"))
}
