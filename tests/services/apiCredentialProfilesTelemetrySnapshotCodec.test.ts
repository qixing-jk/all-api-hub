import { describe, expect, it } from "vitest"

import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetrySnapshotCodec"
import { SiteHealthStatus } from "~/types"

describe("api credential telemetry snapshot codec", () => {
  it("preserves membership-only quota facts", () => {
    expect(
      coerceTelemetrySnapshot({
        lastSyncTime: 123,
        health: { status: SiteHealthStatus.Healthy },
        facts: { quota: { windows: [], membershipLevel: "pro" } },
        attempts: [],
      })?.facts?.quota,
    ).toEqual({ windows: [], membershipLevel: "pro" })
  })
})
