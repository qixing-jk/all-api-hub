import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { sub2ApiBrowserIdentity } from "~/services/apiAdapters/sub2api/browserIdentity"
import * as sub2ApiBrowserSession from "~/services/apiService/sub2api/browserSession"

describe("sub2ApiBrowserIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("observes only Sub2API sites", () => {
    expect(
      sub2ApiBrowserIdentity.canObserve({
        siteType: SITE_TYPES.SUB2API,
        origin: "https://sub2.example.invalid",
        candidateUserIds: [],
      }),
    ).toBe(true)
    expect(
      sub2ApiBrowserIdentity.canObserve({
        siteType: SITE_TYPES.NEW_API,
        origin: "https://sub2.example.invalid",
        candidateUserIds: [],
      }),
    ).toBe(false)
  })

  it("returns null when the browser token is absent", () => {
    vi.spyOn(
      sub2ApiBrowserSession,
      "readSub2ApiBrowserToken",
    ).mockReturnValueOnce({ token: "", expiresAt: undefined })

    expect(
      sub2ApiBrowserIdentity.observe({
        origin: "https://sub2.example.invalid",
        siteType: SITE_TYPES.SUB2API,
        candidateUserIds: [],
      }),
    ).toBeNull()
  })

  it("verifies the session against the account origin", async () => {
    vi.spyOn(
      sub2ApiBrowserSession,
      "readSub2ApiBrowserToken",
    ).mockReturnValueOnce({ token: "test-token", expiresAt: undefined })

    const observer = sub2ApiBrowserIdentity.observe({
      origin: "https://sub2.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      candidateUserIds: [],
    })

    const read = vi.fn().mockResolvedValueOnce({ code: 0, data: { id: 42 } })
    await expect(observer?.verify(read)).resolves.toBe(42)
    expect(read).toHaveBeenCalledWith({
      url: "https://sub2.example.invalid/api/v1/auth/me",
      headers: { Authorization: "Bearer test-token" },
    })
  })

  // ai-router.dev keeps the dashboard and the API on different origins; the
  // dashboard origin answers /api/v1/auth/me with its SPA fallback page.
  // See .scratch/ai-router-adaptation/research.md.
  it("verifies a split-origin deployment against its API origin", async () => {
    vi.spyOn(
      sub2ApiBrowserSession,
      "readSub2ApiBrowserToken",
    ).mockReturnValueOnce({ token: "test-token", expiresAt: undefined })

    const observer = sub2ApiBrowserIdentity.observe({
      origin: "https://ai-router.dev",
      siteType: SITE_TYPES.SUB2API,
      candidateUserIds: [],
    })

    const read = vi.fn().mockResolvedValueOnce({ code: 0, data: { id: 3725 } })
    await expect(observer?.verify(read)).resolves.toBe(3725)
    expect(read).toHaveBeenCalledWith({
      url: "https://api.ai-router.dev/api/v1/auth/me",
      headers: { Authorization: "Bearer test-token" },
    })
  })
})
