import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { fetchSiteStatus } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"

vi.mock(
  "~/services/apiService/newApiFamily/default/accountBootstrap",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/newApiFamily/default/accountBootstrap")
      >()
    return {
      ...actual,
      fetchSiteStatus: vi.fn(),
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

const fetchSiteStatusMock = vi.mocked(fetchSiteStatus)

describe("public site status name probe", () => {
  beforeEach(() => {
    server.resetHandlers()
    fetchSiteStatusMock.mockReset()
    server.use(
      http.get(/\/api\/user\/info$/, () => {
        return HttpResponse.json({ message: "not found" }, { status: 404 })
      }),
      http.get(/\/api\/v1\/auth\/me$/, () => {
        return HttpResponse.json({ message: "not found" }, { status: 404 })
      }),
      http.get("https://example.com/", () => {
        return HttpResponse.html("<html><title>One API</title></html>")
      }),
    )
  })

  it("keeps title detection when the public status probe throws", async () => {
    fetchSiteStatusMock.mockRejectedValue(new Error("status unavailable"))

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.ONE_API,
    )
    expect(fetchSiteStatusMock).toHaveBeenCalled()
  })

  it("retries the public status probe without the bypass context", async () => {
    fetchSiteStatusMock
      .mockRejectedValueOnce(new Error("shielded attempt could not load"))
      .mockResolvedValueOnce({
        system_name: "White Label Portal",
        rix_version_message: "6.5.17",
      })

    await expect(
      getAccountSiteType(
        "https://example.com",
        automaticExecution(
          PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          TEMP_WINDOW_REQUEST_SOURCES.Options,
        ),
      ),
    ).resolves.toBe(SITE_TYPES.RIX_API)

    expect(fetchSiteStatusMock).toHaveBeenCalledTimes(2)
    expect(fetchSiteStatusMock.mock.calls[1]?.[0]).not.toHaveProperty(
      "protectionBypassExecution",
    )
  })

  it("reports no signals when neither status probe attempt answers", async () => {
    fetchSiteStatusMock.mockRejectedValue(new Error("status unavailable"))

    await expect(
      getAccountSiteType(
        "https://example.com",
        automaticExecution(
          PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          TEMP_WINDOW_REQUEST_SOURCES.Options,
        ),
      ),
    ).resolves.toBe(SITE_TYPES.ONE_API)

    expect(fetchSiteStatusMock).toHaveBeenCalledTimes(2)
  })
})
