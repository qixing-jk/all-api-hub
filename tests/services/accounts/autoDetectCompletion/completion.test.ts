import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import {
  AutoDetectCompletionError,
  completeAutoDetectedAccount,
  discoverCompletedCheckIn,
} from "~/services/accounts/autoDetectCompletion/completion"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { inspectCheckInMethods } from "~/services/checkin/autoCheckin/domain"
import { createAutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const {
  getSiteTypeCapabilitiesMock,
  accountCompletionMock,
  fetchSiteStatusMock,
  fetchCheckInStatusMock,
} = vi.hoisted(() => ({
  getSiteTypeCapabilitiesMock: vi.fn(),
  accountCompletionMock: {
    complete: vi.fn(),
  },
  fetchSiteStatusMock: vi.fn(),
  fetchCheckInStatusMock: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiData: fetchCheckInStatusMock,
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
  checkIn: createCompatibilityCheckInConfig({
    siteType: SITE_TYPES.NEW_API,
    supported: true,
    automaticExecutionEnabled: true,
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }),
}

describe("auto-detect completion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        completion: accountCompletionMock,
        bootstrap: {
          fetchSiteStatus: fetchSiteStatusMock,
        },
      },
    })
    accountCompletionMock.complete.mockResolvedValue(completedAccountData)
    fetchCheckInStatusMock.mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
  })

  it("routes completion through the adapter with valid current-tab context", async () => {
    const fetchContext = currentTabFetchContext("https://status.example.com")
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    )
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
    }
    const detected = {
      userId: "7",
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
    }
    const onRecoveryData = vi.fn()

    const result = await completeAutoDetectedAccount({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      autoDetectContext,
      protectionBypassExecution,
      detected,
      onRecoveryData,
    })

    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(accountCompletionMock.complete).toHaveBeenCalledTimes(1)

    const [adapterRequest, helpers] =
      accountCompletionMock.complete.mock.calls[0]
    expect(adapterRequest).toEqual({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected,
      autoDetectContext,
      context: { fetchContext, protectionBypassExecution },
    })
    expect(adapterRequest.context.protectionBypassExecution).toBe(
      protectionBypassExecution,
    )
    helpers.captureRecoveryData({ username: "partial-user" })
    expect(onRecoveryData).toHaveBeenCalledWith(completedAccountData)
    expect(onRecoveryData).toHaveBeenCalledWith({ username: "partial-user" })
    expect(
      helpers.createServiceRequest({
        baseUrl: "https://status.example.com",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "7",
        },
        context: { fetchContext, protectionBypassExecution },
      }),
    ).toEqual({
      baseUrl: "https://status.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
      fetchContext,
      protectionBypassExecution,
    })
    expect(
      helpers.createServiceRequest({
        baseUrl: "https://status.example.com",
        auth: { authType: AuthTypeEnum.None },
        context: { fetchContext, protectionBypassExecution },
      }).protectionBypassExecution,
    ).toBe(protectionBypassExecution)
    expect(helpers.trimString("  trimmed  ")).toBe("trimmed")
    expect(
      helpers.createInitialCheckInConfig({
        supported: true,
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
    await expect(helpers.fetchSiteName(null)).resolves.toBe("Example")
    expect(fetchSiteStatusMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ...completedAccountData,
      checkIn: {
        automaticExecutionEnabled: true,
        customCheckIn: completedAccountData.checkIn.customCheckIn,
        methodKnowledge: {
          methods: {
            "new-api:daily-checkin": {
              detection: {
                outcome: "matched",
                evidence: {
                  source: "probe",
                  observedAt: expect.any(Number),
                },
              },
              status: {
                outcome: "known",
                today: "not_checked",
                evidence: {
                  source: "probe",
                  observedAt: expect.any(Number),
                },
              },
            },
          },
          lastFullDiscoveryAt: expect.any(Number),
        },
        selection: {
          mode: "automatic",
          methodId: "new-api:daily-checkin",
        },
      },
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
      autoDetectContext,
    })
    expect(result).not.toHaveProperty("mode")
    expect(result).not.toHaveProperty("status")
    expect(fetchCheckInStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://status.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "service-token",
        },
        fetchContext,
        protectionBypassExecution,
      }),
      expect.objectContaining({
        endpoint: expect.stringMatching(/^\/api\/user\/checkin\?month=/),
      }),
    )
  })

  it("propagates the cookie-auth session into explicit discovery", async () => {
    accountCompletionMock.complete.mockResolvedValueOnce({
      ...completedAccountData,
      authType: AuthTypeEnum.Cookie,
    })

    await completeAutoDetectedAccount({
      url: "https://cookie.example.invalid",
      requestedAuthType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=example",
      detected: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
      },
    })

    expect(fetchCheckInStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieAuthSessionCookie: "session=example",
        auth: expect.objectContaining({ authType: AuthTypeEnum.Cookie }),
      }),
      expect.any(Object),
    )
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

  it.each([
    {
      name: "ambiguous",
      outcomes: ["matched", "matched"] as const,
      expectedDecision: "ambiguous",
    },
    {
      name: "unsupported",
      outcomes: ["unsupported", "unsupported"] as const,
      expectedDecision: "unsupported",
    },
    {
      name: "incomplete",
      outcomes: ["matched", "unknown"] as const,
      expectedDecision: "unknown",
    },
  ])(
    "keeps the completion draft unselected when discovery is $name",
    async ({ outcomes, expectedDecision }) => {
      const methodIds = [
        "new-api:daily-checkin",
        "veloera:daily-checkin",
      ] as const
      const registry = createAutoCheckinMethodRegistry(
        methodIds.map((id, index) => ({
          id,
          siteTypes: [SITE_TYPES.NEW_API],
          provider: {
            getReadiness: () => ({ ready: true }),
            detect: async () =>
              outcomes[index] === "matched"
                ? {
                    outcome: "matched" as const,
                    evidence: { source: "probe" as const, observedAt: 50 },
                  }
                : outcomes[index] === "unsupported"
                  ? {
                      outcome: "unsupported" as const,
                      evidence: { source: "probe" as const, observedAt: 50 },
                    }
                  : {
                      outcome: "unknown" as const,
                      reason: "network" as const,
                      attemptedAt: 50,
                    },
            checkIn: async () => ({ status: "success" as const }),
          },
        })),
      )
      const completed = await discoverCompletedCheckIn({
        url: "https://completion.example.invalid",
        siteType: SITE_TYPES.NEW_API,
        completed: {
          ...completedAccountData,
          checkIn: createCompatibilityCheckInConfig({
            siteType: SITE_TYPES.NEW_API,
            supported: false,
            automaticExecutionEnabled: true,
          }),
        },
        registry,
        observedAt: 50,
      })

      expect(completed.checkIn.selection).toEqual({ mode: "automatic" })
      expect(
        inspectCheckInMethods({
          config: completed.checkIn,
          candidateMethodIds: [...methodIds],
        }).decision.outcome,
      ).toBe(expectedDecision)
    },
  )

  it("records a bounded completion timeout without blocking the draft", async () => {
    const registry = createAutoCheckinMethodRegistry([
      {
        id: "new-api:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => new Promise<never>(() => undefined),
          checkIn: async () => ({ status: "success" }),
        },
      },
    ])

    const completed = await discoverCompletedCheckIn({
      url: "https://timeout.example.invalid",
      siteType: SITE_TYPES.NEW_API,
      completed: {
        ...completedAccountData,
        checkIn: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.NEW_API,
          supported: false,
          automaticExecutionEnabled: true,
        }),
      },
      registry,
      observedAt: 60,
      perAdapterTimeoutMs: 1,
      deadlineMs: 5,
    })

    expect(
      completed.checkIn.methodKnowledge.methods["new-api:daily-checkin"]
        ?.detection,
    ).toEqual({ outcome: "unknown", reason: "timeout", attemptedAt: 60 })
    expect(completed.checkIn.selection).toEqual({ mode: "automatic" })
  })

  it("rejects when the adapter does not implement account completion", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
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
