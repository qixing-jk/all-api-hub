import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"

const { siteStatusRequest } = vi.hoisted(() => ({
  siteStatusRequest: vi.fn(),
}))

vi.mock(
  "~/services/apiService/newApiFamily/request",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/newApiFamily/request")
      >()
    return {
      ...actual,
      newApiFamilyRequests: {
        ...actual.newApiFamilyRequests,
        data: siteStatusRequest,
      },
    }
  },
)

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()

  return {
    ...actual,
    canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
    tempWindowFetch: vi.fn(),
  }
})

const RUN_BYPASS = createAutomaticProtectionBypassExecution(
  PROTECTION_BYPASS_FEATURES.Checkin,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
  TEMP_WINDOW_REQUEST_SOURCES.Background,
)

describe("site type detection under a bypass context", () => {
  beforeEach(() => {
    server.resetHandlers()
    siteStatusRequest.mockReset()
    // The protected probes cannot claim this origin, so the public status name is
    // what identifies the site, and the shell title alone would say New API.
    server.use(
      http.get(/\/api\/user\/info$/, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
      http.get(/\/api\/v1\/auth\/me$/, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
      http.get("https://example.com", () =>
        HttpResponse.html("<html><title>New API</title></html>"),
      ),
    )
  })

  it("reads the public status name under the caller's execution", async () => {
    siteStatusRequest.mockResolvedValue({ system_name: "Veloera" })

    await expect(
      getAccountSiteType("https://example.com", RUN_BYPASS),
    ).resolves.toBe(SITE_TYPES.VELOERA)

    expect(siteStatusRequest).toHaveBeenCalledWith(
      expect.objectContaining({ protectionBypassExecution: RUN_BYPASS }),
      expect.anything(),
    )
  })

  it("reads the public status name without one when the caller has none", async () => {
    siteStatusRequest.mockResolvedValue({ system_name: "Veloera" })

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.VELOERA,
    )

    expect(siteStatusRequest).toHaveBeenCalledWith(
      expect.not.objectContaining({
        protectionBypassExecution: expect.anything(),
      }),
      expect.anything(),
    )
  })
})
