import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ApiError } from "~/services/apiTransport/errors"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import {
  fetchSiteOriginalTitle,
  getAccountSiteType,
} from "~/services/siteDetection/detectSiteType"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  automaticExecution,
  userCommandExecution,
} from "~~/tests/services/protectionBypass/fixtures"

const SITE_DETECTION_EXECUTION = automaticExecution(
  PROTECTION_BYPASS_FEATURES.SiteDetection,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
  TEMP_WINDOW_REQUEST_SOURCES.Options,
)

const mocks = vi.hoisted(() => ({
  canUseTempWindowFetch: vi.fn(),
  tempWindowFetch: vi.fn(),
  fetchApi: vi.fn(),
  fetchApiData: vi.fn(),
  safeRandomUUID: vi.fn((prefix: string) => `uuid:${prefix}`),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  canUseTempWindowFetch: mocks.canUseTempWindowFetch,
  tempWindowFetch: mocks.tempWindowFetch,
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: mocks.fetchApi,
  fetchApiData: mocks.fetchApiData,
}))

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: mocks.safeRandomUUID,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mocks.logger,
}))

describe("detectSiteType temp-context fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    mocks.canUseTempWindowFetch.mockResolvedValue(false)
    mocks.tempWindowFetch.mockResolvedValue({ success: false })
    mocks.fetchApi.mockResolvedValue(
      "<html><title>Fallback Title</title></html>",
    )
    mocks.fetchApiData.mockResolvedValue({})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the temp-window HTML title when that fetch succeeds", async () => {
    mocks.canUseTempWindowFetch.mockResolvedValue(true)
    mocks.tempWindowFetch.mockResolvedValue({
      success: true,
      data: "<html><title>WONG公益站</title></html>",
    })

    const title = await fetchSiteOriginalTitle(
      "https://example.com/app",
      SITE_DETECTION_EXECUTION,
    )

    expect(title).toBe("WONG公益站")
    expect(mocks.fetchApi).not.toHaveBeenCalled()
    expect(mocks.tempWindowFetch).toHaveBeenCalledWith({
      originUrl: "https://example.com/",
      fetchUrl: "https://example.com/",
      responseType: "text",
      fetchOptions: {
        credentials: "include",
        cache: "no-store",
      },
      requestId: "uuid:fetch-title-https://example.com/",
      protectionBypassExecution: SITE_DETECTION_EXECUTION,
    })
  })

  it("preserves onboarding execution through the temp-context title fetch", async () => {
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    )
    mocks.canUseTempWindowFetch.mockResolvedValue(true)
    mocks.tempWindowFetch.mockResolvedValue({
      success: true,
      data: "<html><title>Example</title></html>",
    })

    await fetchSiteOriginalTitle(
      "https://example.invalid",
      protectionBypassExecution,
    )

    expect(mocks.tempWindowFetch).toHaveBeenCalledWith(
      expect.objectContaining({ protectionBypassExecution }),
    )
  })

  it("falls back to the direct fetch when the temp-window probe throws", async () => {
    mocks.canUseTempWindowFetch.mockRejectedValue(new Error("popup blocked"))
    mocks.fetchApi.mockResolvedValue(
      "<html><title>Direct Fetch Title</title></html>",
    )

    const title = await fetchSiteOriginalTitle(
      "https://example.com",
      SITE_DETECTION_EXECUTION,
    )

    expect(title).toBe("Direct Fetch Title")
    expect(mocks.fetchApi).toHaveBeenCalledWith(
      {
        baseUrl: "https://example.com",
        auth: { authType: AuthTypeEnum.None },
        protectionBypassExecution: SITE_DETECTION_EXECUTION,
      },
      {
        endpoint: "/",
        responseType: "text",
        options: {
          cache: "no-store",
        },
      },
      true,
    )
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1)
  })

  it("infers the site type from the API user-id suffix when the title is not recognized", async () => {
    mocks.fetchApi.mockResolvedValue(
      "<html><title>Mystery Control Panel</title></html>",
    )
    mocks.fetchApiData.mockRejectedValue(
      new ApiError(
        `invalid user id ${SITE_TYPES.NEW_API}`,
        400,
        "/api/user/self",
      ),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.NEW_API,
    )
  })

  it("returns UNKNOWN when the API error message is blank", async () => {
    mocks.fetchApi.mockResolvedValue(
      "<html><title>Mystery Control Panel</title></html>",
    )
    mocks.fetchApiData.mockRejectedValue(
      new ApiError("   ", 401, "/api/user/self"),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.UNKNOWN,
    )
  })

  it("returns UNKNOWN when the API error message is empty", async () => {
    mocks.fetchApi.mockResolvedValue(
      "<html><title>Mystery Control Panel</title></html>",
    )
    mocks.fetchApiData.mockRejectedValue(
      new ApiError("", 401, "/api/user/self"),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.UNKNOWN,
    )
  })

  it("rethrows unexpected non-ApiError failures from the API fallback probe", async () => {
    mocks.fetchApi.mockResolvedValue(
      "<html><title>Mystery Control Panel</title></html>",
    )
    mocks.fetchApiData.mockRejectedValue(new TypeError("network down"))

    await expect(getAccountSiteType("https://example.com")).rejects.toThrow(
      "network down",
    )
  })
})
