import { describe, expect, it } from "vitest"

import {
  deriveReleaseUpdateCheckOutcome,
  deriveReleaseUpdatePresentation,
  getReleaseUpdateLatestVersion,
  hasAvailableReleaseUpdate,
  RELEASE_UPDATE_ACTION_KINDS,
  RELEASE_UPDATE_CHECK_OUTCOMES,
  RELEASE_UPDATE_PRESENTATION_STATES,
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
    selfUpdate: false,
    storeUpdate: {
      supported: false,
      status: "unsupported",
      version: null,
    },
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

  it("prioritizes a browser-store update that is ready to apply", () => {
    expect(
      deriveReleaseUpdatePresentation({
        isLoading: false,
        status: buildStatus({
          latestVersion: "3.32.0",
          updateAvailable: true,
          storeUpdate: {
            supported: true,
            status: "update_available",
            version: "3.32.0",
          },
        }),
      }),
    ).toMatchObject({
      actionKind: "reload-to-update",
      hasUpdate: true,
      state: "store-update-ready",
    })

    expect(
      deriveReleaseUpdateCheckOutcome(
        buildStatus({
          storeUpdate: {
            supported: true,
            status: "update_available",
            version: "3.32.0",
          },
        }),
      ),
    ).toBe("store-update-ready")

    expect(
      deriveReleaseUpdateCheckOutcome(
        buildStatus({
          lastError: "network error",
          storeUpdate: {
            supported: true,
            status: "update_available",
            version: "3.32.0",
          },
        }),
      ),
    ).toBe("store-update-ready")
  })

  it("collapses manual check results into toast outcomes", () => {
    expect(deriveReleaseUpdateCheckOutcome(null)).toBe("check-failed")

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

  it("lets the browser apply a self-hosted update instead of linking a download", () => {
    // The CRX build advertises `update_url`, so the browser installs the new
    // version itself; offering a ZIP download would duplicate that.
    expect(
      deriveReleaseUpdatePresentation({
        isLoading: false,
        status: buildStatus({
          reason: "github-release",
          selfUpdate: true,
          latestVersion: "3.32.0",
          updateAvailable: true,
        }),
      }),
    ).toMatchObject({
      actionKind: RELEASE_UPDATE_ACTION_KINDS.ViewReleaseNotes,
      hasUpdate: true,
      state: RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable,
    })
  })

  it("keeps the download action for a manual GitHub install", () => {
    expect(
      deriveReleaseUpdatePresentation({
        isLoading: false,
        status: buildStatus({
          reason: "github-release",
          selfUpdate: false,
          latestVersion: "3.32.0",
          updateAvailable: true,
        }),
      }),
    ).toMatchObject({
      actionKind: RELEASE_UPDATE_ACTION_KINDS.DownloadUpdate,
      hasUpdate: true,
      state: RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable,
    })
  })

  it("reports a self-hosted update as pending until the browser fetches it", () => {
    // The browser checks `update_url` on its own schedule, so a manual check
    // cannot claim the update is installed.
    expect(
      deriveReleaseUpdateCheckOutcome(
        buildStatus({
          reason: "github-nightly",
          selfUpdate: true,
          latestVersion: "abc1234",
          updateAvailable: true,
          checkedAt: Date.now(),
        }),
      ),
    ).toBe(RELEASE_UPDATE_CHECK_OUTCOMES.SelfUpdatePending)
  })
})
