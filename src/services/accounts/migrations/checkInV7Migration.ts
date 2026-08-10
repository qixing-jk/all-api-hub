import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configCodec"
import type { SiteAccount } from "~/types"
import type { CheckInConfig, CheckInMethodId } from "~/types/checkIn"

export const ACCOUNT_CONFIG_V7_VERSION = 7 as const

type SiteAccountV7 = Omit<SiteAccount, "checkIn" | "configVersion"> & {
  checkIn: CheckInConfig
  configVersion: typeof ACCOUNT_CONFIG_V7_VERSION
}

export type StoredSiteAccountForV7Codec = Omit<
  SiteAccount,
  "checkIn" | "configVersion"
> & {
  checkIn?: unknown
  configVersion?: number
  can_check_in?: boolean
  supports_check_in?: boolean
}

interface LegacyCheckInMethodResolver {
  getLegacyMethodIds(
    siteType: SiteAccount["site_type"],
  ): readonly CheckInMethodId[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const removeLegacyAccountCheckInFields = (
  account: StoredSiteAccountForV7Codec | SiteAccountV7,
) => {
  const {
    can_check_in: _canCheckIn,
    supports_check_in: _supportsCheckIn,
    ...canonicalAccount
  } = account as StoredSiteAccountForV7Codec
  return canonicalAccount
}

const migrateLegacyStatus = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!isRecord(value) || typeof value.isCheckedInToday !== "boolean") {
    return undefined
  }
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    today: value.isCheckedInToday
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration,
      legacyObservedAt: value.lastDetectedAt,
      legacyDayKey: value.lastCheckInDate,
    },
  }
}

/** Converts legacy account check-in storage into the canonical V7 shape. */
export function migrateSiteAccountCheckInToV7(
  account: StoredSiteAccountForV7Codec | SiteAccountV7,
  registry: LegacyCheckInMethodResolver,
): SiteAccountV7 {
  const canonicalAccount = removeLegacyAccountCheckInFields(account)
  if (account.configVersion === ACCOUNT_CONFIG_V7_VERSION) {
    const normalizedAccount: SiteAccountV7 = {
      ...canonicalAccount,
      checkIn: normalizeCheckInConfigV7(account.checkIn),
      configVersion: ACCOUNT_CONFIG_V7_VERSION,
    }
    return normalizedAccount
  }

  const legacyCheckIn = isRecord(account.checkIn) ? account.checkIn : {}
  const methods: Record<string, unknown> = {}
  let selectedMethodId: CheckInMethodId | undefined

  if (legacyCheckIn.enableDetection === true) {
    const legacyMethodIds = registry.getLegacyMethodIds(account.site_type)
    if (legacyMethodIds.length === 1) {
      selectedMethodId = legacyMethodIds[0]
      const status = migrateLegacyStatus(legacyCheckIn.siteStatus)
      methods[selectedMethodId] = {
        detection: {
          outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
          evidence: {
            source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.LegacyMigration,
          },
        },
        ...(status ? { status } : {}),
      }
    }
  }

  const migratedAccount: SiteAccountV7 = {
    ...canonicalAccount,
    checkIn: normalizeCheckInConfigV7({
      automaticExecutionEnabled: legacyCheckIn.autoCheckInEnabled !== false,
      methodKnowledge: { methods },
      selection: {
        mode: CHECK_IN_SELECTION_MODES.Automatic,
        ...(selectedMethodId ? { methodId: selectedMethodId } : {}),
      },
      ...(isRecord(legacyCheckIn.customCheckIn)
        ? { customCheckIn: { ...legacyCheckIn.customCheckIn } }
        : {}),
    }),
    configVersion: ACCOUNT_CONFIG_V7_VERSION,
  }
  return migratedAccount
}
