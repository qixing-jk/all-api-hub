import { describe, expect, it } from "vitest"

import {
  createDefaultReleaseUpdateStatus,
  RELEASE_UPDATE_REASONS,
} from "~/services/updates/releaseUpdateStatus"
import { parseReleaseUpdateStatus } from "~/services/updates/statusCodec"

describe("parseReleaseUpdateStatus", () => {
  it("returns null for non-object payloads and whitespace-only current versions", () => {
    expect(parseReleaseUpdateStatus(null)).toBeNull()
    expect(parseReleaseUpdateStatus("invalid")).toBeNull()
    expect(
      parseReleaseUpdateStatus({
        currentVersion: "   ",
      }),
    ).toBeNull()
  })

  it("trims the current version and falls back invalid reason and release URL values", () => {
    const parsed = parseReleaseUpdateStatus({
      currentVersion: " 3.31.0 ",
      reason: "not-a-real-reason",
      releaseUrl: "javascript:alert(1)",
    })

    expect(parsed).toMatchObject({
      currentVersion: "3.31.0",
      reason: RELEASE_UPDATE_REASONS.Unknown,
      releaseUrl: createDefaultReleaseUpdateStatus("3.31.0").releaseUrl,
    })
  })

  it("normalizes blank latestVersion and malformed checkedAt and lastError fields", () => {
    const parsed = parseReleaseUpdateStatus({
      currentVersion: "3.31.0",
      latestVersion: "   ",
      checkedAt: "yesterday",
      lastError: 123,
    })

    expect(parsed).toMatchObject({
      currentVersion: "3.31.0",
      latestVersion: null,
      checkedAt: null,
      lastError: null,
    })
  })

  it("accepts and normalizes valid https release URLs", () => {
    const parsed = parseReleaseUpdateStatus({
      currentVersion: "3.31.0",
      reason: RELEASE_UPDATE_REASONS.ChromiumDevelopment,
      releaseUrl:
        " https://github.com/qixing-jk/all-api-hub/releases/tag/v3.31.0 ",
      lastError: " network issue ",
    })

    expect(parsed).toMatchObject({
      currentVersion: "3.31.0",
      reason: RELEASE_UPDATE_REASONS.ChromiumDevelopment,
      releaseUrl:
        "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.31.0",
      lastError: "network issue",
    })
  })

  it("falls back to the default release URL when releaseUrl is empty or non-string", () => {
    const fallback = createDefaultReleaseUpdateStatus("3.31.0").releaseUrl

    expect(
      parseReleaseUpdateStatus({
        currentVersion: "3.31.0",
        releaseUrl: "",
      }),
    ).toMatchObject({ releaseUrl: fallback })

    expect(
      parseReleaseUpdateStatus({
        currentVersion: "3.31.0",
        releaseUrl: 42,
      }),
    ).toMatchObject({ releaseUrl: fallback })
  })
})
