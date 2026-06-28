import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import {
  AutoDetectCompletionError,
  completeAutoDetectedAccount,
} from "~/services/accounts/autoDetectCompletion/completion"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const { getSiteAdapterMock, accountCompletionMock } = vi.hoisted(() => ({
  getSiteAdapterMock: vi.fn(),
  accountCompletionMock: {
    complete: vi.fn(),
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))

const currentTabFetchContext = (origin: string) => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin,
})

const browserFetchContext = () => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
  cookieStoreId: "firefox-container-2",
})

const completedAccountData = {
  username: "service-user",
  siteName: "Status Portal",
  accessToken: "service-token",
  userId: "7",
  exchangeRate: 6.8,
  authType: AuthTypeEnum.AccessToken,
  checkIn: {
    enableDetection: true,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  },
}

describe("auto-detect completion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSiteAdapterMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      accountCompletion: accountCompletionMock,
    })
    accountCompletionMock.complete.mockResolvedValue(completedAccountData)
  })

  it("routes completion through the adapter with valid current-tab context", async () => {
    const fetchContext = currentTabFetchContext("https://status.example.com")
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
    }
    const detected = {
      userId: "7",
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
    }

    const result = await completeAutoDetectedAccount({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      autoDetectContext,
      detected,
    })

    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(accountCompletionMock.complete).toHaveBeenCalledTimes(1)

    const [adapterRequest, helpers] =
      accountCompletionMock.complete.mock.calls[0]
    expect(adapterRequest).toEqual({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected,
      autoDetectContext,
      context: { fetchContext },
    })
    expect(Object.keys(helpers).sort()).toEqual(
      [
        "createServiceRequest",
        "fetchSiteName",
        "createCompletionError",
        "trimString",
        "createInitialCheckInConfig",
        "handleCheckInSupportFetchFailure",
      ].sort(),
    )
    expect(
      helpers.createServiceRequest({
        baseUrl: "https://status.example.com",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "7",
        },
        context: { fetchContext },
      }),
    ).toEqual({
      baseUrl: "https://status.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
      fetchContext,
    })
    expect(helpers.trimString("  trimmed  ")).toBe("trimmed")
    expect(
      helpers.createInitialCheckInConfig({
        enableDetection: true,
        autoCheckInEnabled: true,
      }),
    ).toEqual(completedAccountData.checkIn)
    expect(
      helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        new Error("token failed"),
      ),
    ).toBeInstanceOf(AutoDetectCompletionError)
    expect(
      helpers.handleCheckInSupportFetchFailure(new Error("probe failed")),
    ).toBe(false)

    await expect(
      helpers.fetchSiteName({
        system_name: "Status Portal",
      }),
    ).resolves.toBe("Status Portal")
    expect(result).toEqual({
      ...completedAccountData,
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
      autoDetectContext,
    })
  })

  it("drops malformed current-tab context before adapter completion", async () => {
    const malformedFetchContext = {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: "not-a-number",
      origin: "https://malformed.example.com",
      cookieStoreId: "",
    } as unknown as ApiServiceFetchContext

    const result = await completeAutoDetectedAccount({
      url: "https://malformed.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: malformedFetchContext,
      },
    })

    const [adapterRequest, helpers] =
      accountCompletionMock.complete.mock.calls[0]
    expect(adapterRequest.context).toEqual({})
    expect(
      helpers.createServiceRequest({
        baseUrl: "https://malformed.example.com",
        auth: { authType: AuthTypeEnum.Cookie, userId: "8" },
        context: {},
      }),
    ).toEqual({
      baseUrl: "https://malformed.example.com",
      auth: { authType: AuthTypeEnum.Cookie, userId: "8" },
    })
    expect(result).not.toHaveProperty("fetchContext")
  })

  it("retains browser fetch context before adapter completion and result", async () => {
    const fetchContext = browserFetchContext()

    const result = await completeAutoDetectedAccount({
      url: "https://browser-context.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "9",
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
    })

    expect(accountCompletionMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { fetchContext },
      }),
      expect.any(Object),
    )
    expect(result.fetchContext).toEqual(fetchContext)
  })

  it("rejects when the adapter does not implement account completion", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
    })

    await expect(
      completeAutoDetectedAccount({
        url: "https://unsupported.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "10",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toMatchObject({
      name: "AutoDetectCompletionError",
      reason: AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
    })
    expect(accountCompletionMock.complete).not.toHaveBeenCalled()
  })

  it("passes adapter completion errors through unchanged", async () => {
    const completionError = new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      new Error("token failed"),
    )
    accountCompletionMock.complete.mockRejectedValueOnce(completionError)

    await expect(
      completeAutoDetectedAccount({
        url: "https://token-failure.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "11",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toBe(completionError)
  })
})
