import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configCodec"
import {
  CHECK_IN_CONFIG_V7_VERSION,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
  type CheckInConfigV7,
} from "~/services/checkin/autoCheckin/domain"
import type { AutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { SiteAccount } from "~/types"

export type SiteAccountV7 = Omit<SiteAccount, "checkIn" | "configVersion"> & {
  checkIn: CheckInConfigV7
  configVersion: typeof CHECK_IN_CONFIG_V7_VERSION
}

type StoredSiteAccountForV7Codec = Omit<
  SiteAccount,
  "checkIn" | "configVersion"
> & {
  checkIn?: unknown
  configVersion?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

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

/**
 * Dormant V6-to-V7 account codec. It is intentionally not registered in the
 * live migration chain until every V7 runtime consumer lands in the cutover ticket.
 */
export function migrateSiteAccountCheckInToV7(
  account: StoredSiteAccountForV7Codec | SiteAccountV7,
  registry: Pick<AutoCheckinMethodRegistry, "getLegacyRegistrations">,
): SiteAccountV7 {
  if (account.configVersion === CHECK_IN_CONFIG_V7_VERSION) {
    const normalizedAccount: SiteAccountV7 = {
      ...account,
      checkIn: normalizeCheckInConfigV7(account.checkIn),
      configVersion: CHECK_IN_CONFIG_V7_VERSION,
    }
    return normalizedAccount
  }

  const legacyCheckIn = isRecord(account.checkIn) ? account.checkIn : {}
  const methods: Record<string, unknown> = {}
  let selectedMethodId: string | undefined

  if (legacyCheckIn.enableDetection === true) {
    const legacyRegistrations = registry.getLegacyRegistrations(
      account.site_type,
    )
    if (legacyRegistrations.length === 1) {
      selectedMethodId = legacyRegistrations[0].id
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
    ...account,
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
    configVersion: CHECK_IN_CONFIG_V7_VERSION,
  }
  return migratedAccount
}
