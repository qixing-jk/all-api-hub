/** Development-only read probes; persistence and selection use the normal flow. */
import { Storage } from "@plasmohq/storage"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
} from "~/constants/checkIn"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount } from "~/types"
import type { AutoCheckinAccountSnapshot } from "~/types/autoCheckin"
import type { CheckInMethodDetection } from "~/types/checkIn"

import { buildAutoCheckinAccountSnapshot } from "./accountSnapshot"
import { autoCheckinMethodRegistry } from "./providers"
import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  createAutoCheckinMethodRegistry,
} from "./providers/registry"

export const DEV_CHECK_IN_FIXTURE_ORIGIN =
  "https://fixture-checkin.example.invalid"
export const DEV_CHECK_IN_FIXTURE_SITE_TYPE =
  AUTO_CHECKIN_METHOD_DEFINITIONS[
    AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn
  ].siteTypes[0]
export const DEV_CHECK_IN_SCENARIOS = [
  { id: "single", label: "Single method" },
  { id: "multiple", label: "Multiple methods" },
  { id: "manual", label: "Manual choice" },
  { id: "failed", label: "Detection failed" },
  { id: "unsupported", label: "Unsupported" },
] as const

/** Require a registered fixture and its exact synthetic identity before simulating. */
function resolveScenario(account: SiteAccount) {
  if (account.site_type !== DEV_CHECK_IN_FIXTURE_SITE_TYPE) return undefined
  if (account.site_url !== DEV_CHECK_IN_FIXTURE_ORIGIN) return undefined
  return DEV_CHECK_IN_SCENARIOS.find(
    ({ id }) =>
      account.account_info.access_token === `dev-checkin-${id}` &&
      account.account_info.id === `dev-checkin-${id}`,
  )
}

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
  const fixtures = accounts.filter((account) => resolveScenario(account))
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
  const scenario = resolveScenario(account)
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
