import { describe, expect, it } from "vitest"

import {
  deriveReleaseUpdateCheckOutcome,
  deriveReleaseUpdatePresentation,
  getReleaseUpdateLatestVersion,
  hasAvailableReleaseUpdate,
} from "~/services/updates/presentation"
import type { ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"

function buildStatus(
  overrides: Partial<ReleaseUpdateStatus> = {},
): ReleaseUpdateStatus {
  return {
    eligible: true,
    reason: "chromium-development",
    currentVersion: "3.31.0",
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
    checkedAt: null,
    lastError: null,
    ...overrides,
  }
}

describe("release update presentation", () => {
  it("treats blank latest versions as unavailable update metadata", () => {
    const status = buildStatus({
      latestVersion: "   ",
      updateAvailable: true,
    })

    expect(getReleaseUpdateLatestVersion(status)).toBeNull()
    expect(hasAvailableReleaseUpdate(status)).toBe(false)
  })

  it("derives the not-checked state before the first successful check", () => {
    expect(
      deriveReleaseUpdatePresentation({
        isLoading: false,
        status: buildStatus(),
      }),
    ).toMatchObject({
      actionKind: "open-latest",
      hasUpdate: false,
      latestVersion: null,
      state: "not-checked",
    })
  })

  it("derives the ineligible state when checks are not supported for the install channel", () => {
    expect(
      deriveReleaseUpdatePresentation({
        isLoading: false,
        status: buildStatus({
          eligible: false,
          reason: "store-build",
        }),
      }),
    ).toMatchObject({
      actionKind: "open-latest",
      hasUpdate: false,
      state: "ineligible",
    })
  })

  it("collapses manual check results into toast outcomes", () => {
    expect(
      deriveReleaseUpdateCheckOutcome(
        buildStatus({
          latestVersion: "3.32.0",
          updateAvailable: true,
          checkedAt: Date.now(),
        }),
      ),
    ).toBe("update-available")

    expect(
      deriveReleaseUpdateCheckOutcome(
        buildStatus({
          latestVersion: "3.31.0",
          checkedAt: Date.now(),
        }),
      ),
    ).toBe("up-to-date")

    expect(
      deriveReleaseUpdateCheckOutcome(
        buildStatus({
          lastError: "network error",
        }),
      ),
    ).toBe("check-failed")
  })
})
