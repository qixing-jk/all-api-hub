import type { TFunction } from "i18next"

import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import type { SiteAccount } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

/**
 * Build stable dedupe-dialog labels using the same global display-name rules as
 * the rest of the app.
 */
export function buildDedupeAccountLabelMap(
  accounts: readonly SiteAccount[],
): Map<string, string> {
  return buildAccountDisplayNameMap([...accounts])
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
