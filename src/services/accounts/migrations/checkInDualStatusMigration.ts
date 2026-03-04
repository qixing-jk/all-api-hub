import type { SiteAccount } from "~/types"

type LegacyCheckInConfigV1 = {
  enableDetection?: boolean
  autoCheckInEnabled?: boolean
  isCheckedInToday?: boolean
  lastCheckInDate?: string
  customCheckInUrl?: string
  customRedeemUrl?: string
  openRedeemWithCheckIn?: boolean
  siteStatus?: unknown
  customCheckIn?: unknown
}

/**
 * Migration: v1 -> v2
 *
 * Previous versions stored a single `checkIn.isCheckedInToday` + `lastCheckInDate`
 * that represented either:
 * - the site check-in status (when no custom URL was set), or
 * - the custom check-in status (when a custom URL was set).
 *
 * v2 splits them into independent states:
 * - `checkIn.siteStatus` for site-backed check-in
 * - `checkIn.customCheckIn` for custom URL check-in
 */
export function migrateCheckInDualStatusConfig(
  account: SiteAccount,
): SiteAccount {
  const legacyCheckIn = account.checkIn as unknown as LegacyCheckInConfigV1

  if (!legacyCheckIn) {
    return account
  }

  const alreadyMigrated =
    typeof legacyCheckIn.siteStatus === "object" ||
    typeof legacyCheckIn.customCheckIn === "object"

  const nextCheckIn: Record<string, any> = { ...legacyCheckIn }

  if (!alreadyMigrated) {
    const customUrl =
      typeof legacyCheckIn.customCheckInUrl === "string"
        ? legacyCheckIn.customCheckInUrl
        : undefined

    const hasCustomUrl =
      typeof customUrl === "string" && customUrl.trim() !== ""

    if (hasCustomUrl) {
      nextCheckIn.customCheckIn = {
        url: customUrl,
        redeemUrl: legacyCheckIn.customRedeemUrl,
        openRedeemWithCheckIn: legacyCheckIn.openRedeemWithCheckIn ?? true,
        isCheckedInToday: legacyCheckIn.isCheckedInToday ?? false,
        lastCheckInDate: legacyCheckIn.lastCheckInDate,
      }
    } else {
      nextCheckIn.siteStatus = {
        isCheckedInToday: legacyCheckIn.isCheckedInToday,
        lastCheckInDate: legacyCheckIn.lastCheckInDate,
      }
    }
  }

  delete nextCheckIn.isCheckedInToday
  delete nextCheckIn.lastCheckInDate
  delete nextCheckIn.customCheckInUrl
  delete nextCheckIn.customRedeemUrl
  delete nextCheckIn.openRedeemWithCheckIn

  return {
    ...account,
    checkIn: nextCheckIn as any,
  }
}
