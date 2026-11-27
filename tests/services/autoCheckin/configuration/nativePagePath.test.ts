import { describe, expect, it } from "vitest"

import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configuration/configCodec"
import {
  invalidateCheckInDiscovery,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

describe("native check-in page configuration", () => {
  it.each([
    undefined,
    null,
    "",
    "invite",
    "//elsewhere.test/",
    "https://elsewhere.test/",
    "/a/../invite",
    "/a/%2e%2e/invite",
    "/\\elsewhere.test",
    "/in vite",
    `/a${"b".repeat(1000)}`,
  ])("ignores an invalid stored page path: %s", (nativePagePath) => {
    expect(
      normalizeCheckInConfigV7({ ...buildCheckInConfig(), nativePagePath })
        .nativePagePath,
    ).toBeUndefined()
  })

  it("saves edits and clears without replacing newer status knowledge", () => {
    const latest = buildCheckInConfig({ nativePagePath: "/old" })
    const edited = mergeUserOwnedCheckInDraft({
      latest,
      draft: { ...latest, nativePagePath: "/invite" },
    })
    expect(edited.nativePagePath).toBe("/invite")
    expect(edited.methodKnowledge).toBe(latest.methodKnowledge)
    expect(
      mergeUserOwnedCheckInDraft({
        latest: edited,
        draft: { ...edited, nativePagePath: undefined },
      }).nativePagePath,
    ).toBeUndefined()
  })

  it.each([
    { origin: "https://site.test/path" },
    { origin: 123 },
    { configuredPath: "//other.test/profile" },
    { path: "/a/../invite" },
    { userId: "" },
    { observedAt: -1 },
  ])("discards an invalid imported learned destination: %j", (fields) => {
    const nativePageHint = {
      path: "/invite",
      origin: "https://site.test",
      siteType: "new-api",
      userId: "42",
      observedAt: 60,
      ...fields,
    }
    expect(
      normalizeCheckInConfigV7({ ...buildCheckInConfig(), nativePageHint })
        .nativePageHint,
    ).toBeUndefined()
  })

  it("retains the page on credential changes and clears it on a deployment change", () => {
    const config = buildCheckInConfig({ nativePagePath: "/invite" })
    expect(invalidateCheckInDiscovery(config).nativePagePath).toBe("/invite")
    expect(
      invalidateCheckInDiscovery(config, { siteUrlChanged: true })
        .nativePagePath,
    ).toBeUndefined()
  })
})
