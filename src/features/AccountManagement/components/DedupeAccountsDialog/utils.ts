import type { TFunction } from "i18next"

import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import type { SiteAccount } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import type { DedupeAccountsDialogGroup } from "./types"

/**
 * Build stable dedupe-dialog labels using the same global display-name rules as
 * the rest of the app.
 */
export function buildDedupeAccountLabelMap(
  accounts: readonly SiteAccount[],
): Map<string, string> {
  return buildAccountDisplayNameMap(accounts)
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

/** Formats the identity shared by accounts in one duplicate group. */
export function formatDedupeGroupIdentityLabel(
  key: DedupeAccountsDialogGroup["key"],
  t: TFunction,
): string {
  if (key.reason === "same_credential") {
    return `${key.siteType} · ${t("ui:dialog.dedupeAccounts.sameCredential")}`
  }
  return t("ui:dialog.dedupeAccounts.userId", { userId: key.userId })
}
