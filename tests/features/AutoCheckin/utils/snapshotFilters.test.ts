import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  filterAutoCheckinSnapshots,
  getAutoCheckinSnapshotReadinessCategory,
  getAutoCheckinSnapshotStatus,
  SNAPSHOT_READINESS_FILTER,
  SNAPSHOT_STATUS_FILTER,
} from "~/features/AutoCheckin/utils/snapshotFilters"
import type { AutoCheckinAccountSnapshot } from "~/types/autoCheckin"

const snapshot = (
  overrides: Partial<AutoCheckinAccountSnapshot> = {},
): AutoCheckinAccountSnapshot => ({
  accountId: "account",
  accountName: "Account",
  siteType: "new-api",
  detectionEnabled: true,
  autoCheckinEnabled: true,
  providerAvailable: true,
  ...overrides,
})

describe("auto-checkin snapshot readiness categories", () => {
  it.each([
    [undefined, SNAPSHOT_READINESS_FILTER.READY],
    ["no_selected_method", SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED],
    ["credentials_missing", SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED],
    ["auto_checkin_disabled", SNAPSHOT_READINESS_FILTER.DISABLED],
    ["account_disabled", SNAPSHOT_READINESS_FILTER.DISABLED],
    ["method_disabled", SNAPSHOT_READINESS_FILTER.DISABLED],
    ["no_provider", SNAPSHOT_READINESS_FILTER.UNSUPPORTED],
    ["account_unavailable", SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE],
    ["network_error", SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE],
    ["source_unavailable", SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE],
    ["account_data_missing", SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED],
    ["authentication_required", SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED],
  ] as const)("maps %s to %s", (skipReason, expected) => {
    expect(
      getAutoCheckinSnapshotReadinessCategory(
        snapshot(skipReason ? { skipReason } : {}),
      ),
    ).toBe(expected)
  })

  it("uses the latest classified result when readiness had no initial skip reason", () => {
    expect(
      getAutoCheckinSnapshotReadinessCategory(
        snapshot({
          lastResult: {
            accountId: "account",
            accountName: "Account",
            status: "failed",
            reasonCode: "network_error",
            timestamp: 1,
          },
        }),
      ),
    ).toBe(SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE)
  })

  it("prefers the current skip reason over an older result reason", () => {
    expect(
      getAutoCheckinSnapshotReadinessCategory(
        snapshot({
          skipReason: "auto_checkin_disabled",
          lastResult: {
            accountId: "account",
            accountName: "Account",
            status: "failed",
            reasonCode: "network_error",
            timestamp: 1,
          },
        }),
      ),
    ).toBe(SNAPSHOT_READINESS_FILTER.DISABLED)
  })

  it("falls back to the execution toggle when no reason was recorded", () => {
    expect(
      getAutoCheckinSnapshotReadinessCategory(
        snapshot({ autoCheckinEnabled: false }),
      ),
    ).toBe(SNAPSHOT_READINESS_FILTER.DISABLED)
  })

  it("maps a skipped execution result to the skipped status filter", () => {
    expect(
      getAutoCheckinSnapshotStatus(
        snapshot({
          lastResult: {
            accountId: "account",
            accountName: "Account",
            status: "skipped",
            timestamp: 1,
          },
        }),
      ),
    ).toBe(SNAPSHOT_STATUS_FILTER.SKIPPED)
  })

  it("applies readiness and status filters before sorting matching rows", () => {
    const matchingRows = [
      snapshot({
        accountId: "zulu",
        accountName: "Zulu",
        skipReason: "network_error",
      }),
      snapshot({
        accountId: "alpha",
        accountName: "Alpha",
        skipReason: "timeout",
      }),
    ]
    const nonMatchingRow = snapshot({
      accountId: "ready",
      accountName: "Ready",
    })

    expect(
      filterAutoCheckinSnapshots(
        [matchingRows[0], nonMatchingRow, matchingRows[1]],
        SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE,
        SNAPSHOT_STATUS_FILTER.SKIPPED,
        "",
        ((key: string) => key) as TFunction,
      ).map(({ accountId }) => accountId),
    ).toEqual(["alpha", "zulu"])
  })
})
