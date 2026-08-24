import { describe, expect, it } from "vitest"

import {
  getAutoCheckinSnapshotReadinessCategory,
  SNAPSHOT_READINESS_FILTER,
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
    ["method_disabled", SNAPSHOT_READINESS_FILTER.DISABLED],
    ["no_provider", SNAPSHOT_READINESS_FILTER.UNSUPPORTED],
    ["network_error", SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE],
    ["source_unavailable", SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE],
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
})
