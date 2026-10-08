/** Development-only read probes; persistence and selection use the normal flow. */
import { Storage } from "@plasmohq/storage"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
} from "~/constants/checkIn"
import { buildAutoCheckinAccountSnapshot } from "~/services/checkin/autoCheckin/accountSnapshot"
import { getDevCheckInFixtureScenario } from "~/services/checkin/autoCheckin/discovery/devDiscoveryFixtureIdentity"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { createAutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount } from "~/types"
import type { AutoCheckinAccountSnapshot } from "~/types/autoCheckin"
import type { CheckInMethodDetection } from "~/types/checkIn"

/** Development data must be owned by the fixture registry, even after a rename. */
async function readRegisteredIds(): Promise<Set<string>> {
  const ids: unknown = await new Storage({ area: "local" }).get(
    STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS,
  )
  return new Set(
    Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [],
  )
}

/** Exposes readiness rows immediately without fabricating or persisting run history. */
export async function appendDevCheckInFixtureSnapshots(
  snapshots: AutoCheckinAccountSnapshot[],
  accounts: SiteAccount[],
): Promise<AutoCheckinAccountSnapshot[]> {
  if (!import.meta.env.DEV) return snapshots
  const fixtures = accounts.filter((account) =>
    getDevCheckInFixtureScenario(account),
  )
  if (!fixtures.length) return snapshots
  const registeredIds = await readRegisteredIds()
  const existingIds = new Set(snapshots.map((snapshot) => snapshot.accountId))
  return [
    ...snapshots,
    ...fixtures
      .filter(
        (account) =>
          registeredIds.has(account.id) && !existingIds.has(account.id),
      )
      .map((account) =>
        buildAutoCheckinAccountSnapshot(account, account.site_name),
      ),
  ]
}

/** Override only the read-only detection adapters of exact, registered fixtures. */
export async function resolveDevCheckInDiscoveryRegistry(account: SiteAccount) {
  if (!import.meta.env.DEV) return undefined
  const scenario = getDevCheckInFixtureScenario(account)
  if (!scenario) return undefined
  if (!(await readRegisteredIds()).has(account.id)) return undefined

  return createAutoCheckinMethodRegistry(
    autoCheckinMethodRegistry
      .getCandidates(account.site_type, account.site_url)
      .map((registration) => ({
        ...registration,
        provider: {
          ...registration.provider,
          detect: async ({ observedAt }): Promise<CheckInMethodDetection> => {
            if (scenario.id === "failed")
              return {
                outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
                reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
                attemptedAt: observedAt,
              }
            const matched =
              scenario.id !== "unsupported" &&
              (registration.id ===
                AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn ||
                (scenario.id !== "single" &&
                  registration.id ===
                    AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn))
            return {
              outcome: matched
                ? CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
                : CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
              evidence: {
                source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
                observedAt,
              },
            }
          },
        },
      })),
  )
}
