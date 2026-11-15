import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import {
  TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS,
  TEMP_WINDOW_REQUEST_SOURCES,
} from "~/types/tempWindowFetch"
import { isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import {
  tempWindowTriggerCheckinPageAction,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { safeRandomUUID } from "~/utils/core/identifier"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { mockFetchSupportCheckIn } = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
}))
const login = vi.hoisted(() => ({ loginAccount: vi.fn() }))
vi.mock("~/services/accountLogin", () => login)

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    data: vi.fn(),
    envelope: vi.fn(),
  },
}))

vi.mock(
  "~/services/apiService/newApiFamily/default/accountBootstrap",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/newApiFamily/default/accountBootstrap")
      >()
    return { ...actual, fetchSupportCheckIn: mockFetchSupportCheckIn }
  },
)

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  tempWindowTriggerCheckinPageAction: vi.fn(),
  tempWindowTurnstileFetch: vi.fn(),
}))

vi.mock("~/utils/browser/runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/runtime")>()
  return { ...actual, isAllowedIncognitoAccess: vi.fn() }
})

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(),
}))

vi.mock("~/services/accounts/utils/siteRouteResolver", () => ({
  SITE_ROUTE_KINDS: {
    CheckIn: "checkIn",
  },
  resolveAccountSiteRouteUrl: vi.fn(() =>
    Promise.resolve("https://site.example.invalid/console/personal"),
  ),
}))

const mockAccount = buildSiteAccount({
  id: "test-id",
  site_name: "Test",
  site_url: "https://site.example.invalid",
  site_type: SITE_TYPES.NEW_API,
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7.0,
  notes: "",
  tagIds: [],
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: "123",
    access_token: "test-token",
    username: "test",
    quota: 1000,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
})

const DEFAULT_PROVIDER_CONTEXT = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
} as const

const checkInForTest = (
  account: Parameters<typeof newApiProvider.checkIn>[0],
  context: Parameters<
    typeof newApiProvider.checkIn
  >[1] = DEFAULT_PROVIDER_CONTEXT,
) => newApiProvider.checkIn(account, context)

const mockCheckInStatusSequence = (...checkedInToday: boolean[]) => {
  const mock = vi.mocked(newApiFamilyRequests.data)
  for (const checked of checkedInToday) {
    mock.mockResolvedValueOnce({
      stats: { checked_in_today: checked },
    } as any)
  }
}

/** Configure one independently verified session without invoking a real browser. */
function prepareAccountSession(
  pageIdentity = "123",
  loseTriggerReply = false,
  beforeTrigger?: () => void,
) {
  const clicked = vi.fn()
  const sendSiteAction = vi.fn(async (action, details?) => {
    if (action === RuntimeActionIds.ContentNewApiDashboardSessionAuth)
      return {
        success: true,
        data: {
          access_token: "dashboard-target",
          token_type: "Bearer",
          access_expires_at: Date.now() / 1000 + 900,
          session: { sid: "target-session", current: true },
          user: { id: "123" },
        },
      }
    if (action === RuntimeActionIds.ContentGetUserFromLocalStorage)
      return { success: true, data: { userId: pageIdentity } }
    beforeTrigger?.()
    if (details?.prepareOnly === true) return { success: true, clicked: false }
    if (typeof details === "function") await details()
    clicked()
    if (loseTriggerReply) throw new Error("Receiver disappeared after dispatch")
    return {
      success: true,
      status: "clicked",
      clicked: true,
      reason: "clicked",
    }
  })
  login.loginAccount.mockImplementation(async (request) => {
    await request.onAuthenticated({
      tabId: 11,
      assertOrigin: async () => {},
      sendSiteAction,
      navigate: vi.fn(),
      waitForReadyPage: vi.fn(),
      setVerificationReason: vi.fn(),
    })
    return { status: "authenticated", identity: "123" }
  })
  vi.mocked(newApiFamilyRequests.envelope)
    .mockResolvedValueOnce({
      success: false,
      message: "Proof of work required",
      data: null,
    })
    .mockResolvedValueOnce({
      success: true,
      message: "",
      data: { id: pageIdentity },
    })
  return {
    clicked,
    sendSiteAction,
    account: {
      ...mockAccount,
      checkIn: structuredClone(mockAccount.checkIn),
      login: {
        methodId: "password",
        credentials: { username: "target", password: "fixture" },
      },
    },
  }
}

describe("newApiProvider", () => {
  it.each(["required", "absent", "lost-reply"])(
    "retains an unconfirmed native click with verification %s",
    async (verification) => {
      vi.useFakeTimers()
      try {
        const { account, clicked, sendSiteAction } = prepareAccountSession(
          "123",
          verification === "lost-reply",
        )
        const original = sendSiteAction.getMockImplementation()!
        sendSiteAction.mockImplementation(async (action, details) => {
          const result = await original(action, details)
          return typeof details === "function" && verification === "required"
            ? ({ ...result, verification: { status: "required" } } as any)
            : result
        })
        vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
          enabled: true,
          stats: { checked_in_today: false },
        })
        const result = checkInForTest(account)
        await vi.advanceTimersByTimeAsync(8500)
        await expect(result).resolves.toMatchObject({
          status: "uncertain",
          reasonCode:
            verification === "required"
              ? "manual_verification_required"
              : "checkin_unconfirmed",
        })
        expect(clicked).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it("prepares a custom selector before dispatching one immediate native click", async () => {
    const { account, clicked, sendSiteAction } = prepareAccountSession()
    account.checkIn.customCheckIn = {
      turnstilePreTrigger: {
        kind: "clickSelector",
        selector: "#check-in",
        targetWaitMs: 1000,
      },
    }
    const original = sendSiteAction.getMockImplementation()!
    const dispatchOptions = vi.fn()
    sendSiteAction.mockImplementation((action, details) =>
      original(
        action,
        typeof details === "function"
          ? async () => {
              const options = await details()
              dispatchOptions(options)
              return options
            }
          : details,
      ),
    )
    vi.mocked(newApiFamilyRequests.data)
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValue({ enabled: true, stats: { checked_in_today: true } })
    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: "success",
    })
    expect(sendSiteAction).toHaveBeenCalledWith(
      RuntimeActionIds.ContentTriggerCheckinPageAction,
      {
        trigger: {
          kind: "clickSelector",
          selector: "#check-in",
          targetWaitMs: 1000,
        },
        prepareOnly: true,
      },
    )
    expect(dispatchOptions).toHaveBeenCalledExactlyOnceWith({
      trigger: {
        kind: "clickSelector",
        selector: "#check-in",
        targetWaitMs: 0,
        throttle: { maxAttempts: 1 },
      },
    })
    expect(clicked).toHaveBeenCalledOnce()
  })
  it.each(["unknown-status", "login-message"])(
    "prepares target login for %s and performs one native claim",
    async (mode) => {
      const { account, clicked } = prepareAccountSession()
      vi.mocked(newApiFamilyRequests.data)
        .mockReset()
        .mockResolvedValueOnce(
          mode === "unknown-status"
            ? {}
            : { enabled: true, stats: { checked_in_today: false } },
        )
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValue({ enabled: true, stats: { checked_in_today: true } })
      vi.mocked(newApiFamilyRequests.envelope).mockReset()
      if (mode === "login-message")
        vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
          success: false,
          message: "Login required",
          data: null,
        })
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
        success: true,
        message: "",
        data: { id: "123" },
      })
      await expect(checkInForTest(account)).resolves.toMatchObject({
        status: "success",
      })
      expect(clicked).toHaveBeenCalledOnce()
    },
  )

  it.each([false, true])(
    "preserves native session cancellation with dispatched=%s",
    async (dispatched) => {
      const { account } = prepareAccountSession()
      vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
        enabled: true,
        stats: { checked_in_today: false },
      })
      login.loginAccount.mockImplementation(async (input) => {
        if (dispatched)
          await input.onAuthenticated({
            navigate: vi.fn(),
            waitForReadyPage: vi.fn(),
            setVerificationReason: vi.fn(),
            assertOrigin: vi.fn(),
            sendSiteAction: async (
              _action: string,
              details?:
                | Record<string, unknown>
                | (() => Promise<Record<string, unknown>>),
            ) => {
              if (typeof details !== "function")
                return {
                  success: true,
                  data: {
                    access_token: "test",
                    token_type: "Bearer",
                    access_expires_at: Date.now() / 1000 + 600,
                    session: { sid: "test", current: true },
                    user: { id: "123" },
                  },
                }
              await details()
              return { clicked: false, status: "target_not_found" }
            },
          })
        return { status: "cancelled" }
      })
      await expect(checkInForTest(account)).resolves.toMatchObject({
        status: dispatched ? "uncertain" : "failed",
      })
    },
  )

  it.each([
    {
      data: { enabled: true, stats: { checked_in_today: true } },
      status: "already_checked",
    },
    {
      data: { enabled: false, stats: { checked_in_today: false } },
      status: "failed",
    },
  ])(
    "stops configured login before mutation for status $status",
    async ({ data, status }) => {
      const { account, clicked } = prepareAccountSession()
      vi.mocked(newApiFamilyRequests.envelope).mockReset()
      vi.mocked(newApiFamilyRequests.data).mockResolvedValue(data)
      await expect(checkInForTest(account)).resolves.toMatchObject({ status })
      expect(login.loginAccount).not.toHaveBeenCalled()
      expect(clicked).not.toHaveBeenCalled()
      expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
    },
  )

  it("does not start a login or mutation when configured-login status is rate limited", async () => {
    const { account } = prepareAccountSession()
    vi.mocked(newApiFamilyRequests.envelope).mockReset()
    vi.mocked(newApiFamilyRequests.data).mockRejectedValue(
      new ApiError("Too many requests", 429),
    )
    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: "failed",
    })
    expect(login.loginAccount).not.toHaveBeenCalled()
    expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
  })

  it("checks current execution intent before the configured-login direct mutation", async () => {
    const { account } = prepareAccountSession()
    vi.mocked(newApiFamilyRequests.envelope).mockReset()
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    await expect(
      checkInForTest(account, {
        ...DEFAULT_PROVIDER_CONTEXT,
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
  })

  it.each([
    { enabled: true, stats: { checked_in_today: true } },
    { enabled: false, stats: { checked_in_today: false } },
    {},
  ])(
    "does not click the authenticated native page without an eligible status %j",
    async (status) => {
      const { account, clicked } = prepareAccountSession()
      vi.mocked(newApiFamilyRequests.data)
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValue(status)
      await checkInForTest(account)
      expect(login.loginAccount).toHaveBeenCalledOnce()
      expect(clicked).not.toHaveBeenCalled()
    },
  )

  it("reports an unavailable native target without dispatching a claim", async () => {
    const { account, clicked, sendSiteAction } = prepareAccountSession()
    account.checkIn.customCheckIn = {
      turnstilePreTrigger: { kind: "clickSelector", selector: "#missing" },
    }
    const original = sendSiteAction.getMockImplementation()!
    sendSiteAction.mockImplementation(async (action, details) =>
      details?.prepareOnly
        ? ({ success: false } as any)
        : original(action, details),
    )
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    await expect(checkInForTest(account)).resolves.toMatchObject({
      status: "failed",
    })
    expect(clicked).not.toHaveBeenCalled()
  })

  it.each([
    { readback: "checked", expected: "success" },
    { readback: "not_checked", expected: "uncertain" },
    { readback: "unavailable", expected: "uncertain" },
  ])(
    "reconciles a lost direct claim with configured login ($readback)",
    async ({ readback, expected }) => {
      vi.mocked(newApiFamilyRequests.data)
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockImplementationOnce(async () => {
          if (readback === "unavailable") throw new TypeError("Failed to fetch")
          return {
            enabled: true,
            stats: { checked_in_today: readback === "checked" },
          }
        })
      vi.mocked(newApiFamilyRequests.envelope).mockImplementationOnce(
        async (request) => {
          request.observer?.onDispatch()
          throw new TypeError("Failed to fetch")
        },
      )
      await expect(
        checkInForTest(
          {
            ...mockAccount,
            login: {
              methodId: "password",
              credentials: { username: "target", password: "fixture" },
            },
          },
          {
            ...DEFAULT_PROVIDER_CONTEXT,
            mutationLifecycle: createAutoCheckinMutationLifecycle(),
          },
        ),
      ).resolves.toMatchObject({ status: expected })
      expect(newApiFamilyRequests.envelope).toHaveBeenCalledTimes(1)
      expect(newApiFamilyRequests.data).toHaveBeenCalledTimes(2)
      expect(login.loginAccount).not.toHaveBeenCalled()
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
    },
  )

  it("does not click a delayed target after intent is withdrawn while it renders", async () => {
    let allowed = true
    const { account, clicked } = prepareAccountSession("123", false, () => {
      allowed = false
    })
    account.checkIn.customCheckIn = {
      turnstilePreTrigger: {
        kind: "clickSelector",
        selector: "#check-in",
        targetWaitMs: 1000,
      },
    }
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    const lifecycle = createAutoCheckinMutationLifecycle()
    const result = await checkInForTest(account, {
      ...DEFAULT_PROVIDER_CONTEXT,
      mutationLifecycle: lifecycle,
      beforeRecoveredMutation: async () => allowed,
    })
    expect(result).toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(clicked).not.toHaveBeenCalled()
    expect(lifecycle.dispatched).toBe(false)
  })

  it("reads back an ambiguous content failure after a native click without replay", async () => {
    const { account, clicked, sendSiteAction } = prepareAccountSession()
    const original = sendSiteAction.getMockImplementation()!
    sendSiteAction.mockImplementation(async (action, details?) => {
      const result = await original(action, details)
      return action === RuntimeActionIds.ContentTriggerCheckinPageAction
        ? ({ success: false, error: "Verification observer failed" } as any)
        : result
    })
    vi.mocked(newApiFamilyRequests.data)
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: true },
      })
    expect((await checkInForTest(account)).status).toBe("success")
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it("does not click when the page account changes during protection clearance", async () => {
    const { account, clicked } = prepareAccountSession("123", false, () => {
      vi.mocked(newApiFamilyRequests.envelope)
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { id: "another-user" },
        })
    })
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    expect(
      (
        await checkInForTest(account, {
          ...DEFAULT_PROVIDER_CONTEXT,
          mutationLifecycle,
        })
      ).status,
    ).toBe("failed")
    expect(clicked).not.toHaveBeenCalled()
    expect(mutationLifecycle.dispatched).toBe(false)
  })

  it("keeps a native click uncertain when authenticated readback fails", async () => {
    const { account, clicked } = prepareAccountSession()
    vi.mocked(newApiFamilyRequests.data)
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockRejectedValueOnce(new ApiError("unauthorized", 401))
    const result = await checkInForTest(account)
    expect(result).toMatchObject({
      status: "uncertain",
      reasonCode: "checkin_unconfirmed",
    })
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it("prepares the configured login after an attributed HTTP 401 rejection", async () => {
    const { account, clicked } = prepareAccountSession()
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    vi.mocked(newApiFamilyRequests.envelope)
      .mockReset()
      .mockImplementationOnce(async () => {
        mutationLifecycle.onDispatch()
        mutationLifecycle.onResponse()
        throw new ApiError(
          "Unauthorized",
          401,
          "/api/user/checkin",
          API_ERROR_CODES.HTTP_401,
        )
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: "123" },
      })
    vi.mocked(newApiFamilyRequests.data)
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: true },
      })
    expect(
      (
        await checkInForTest(account, {
          ...DEFAULT_PROVIDER_CONTEXT,
          mutationLifecycle,
        })
      ).status,
    ).toBe("success")
    expect(login.loginAccount).toHaveBeenCalledTimes(1)
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch a native click when intent is withdrawn during page protection", async () => {
    let allowed = true
    const { account, clicked } = prepareAccountSession("123", false, () => {
      allowed = false
    })
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    const result = await checkInForTest(account, {
      ...DEFAULT_PROVIDER_CONTEXT,
      mutationLifecycle,
      beforeRecoveredMutation: async () => allowed,
    })
    expect(result).toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(clicked).not.toHaveBeenCalled()
    expect(mutationLifecycle.dispatched).toBe(false)
  })

  it.each(["another-user", ""])(
    "does not click a page belonging to %s",
    async (identity) => {
      const { account, clicked } = prepareAccountSession(identity)
      vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
        enabled: true,
        stats: { checked_in_today: false },
      })
      expect(await checkInForTest(account)).toMatchObject({
        status: "failed",
        reasonCode: "authentication_required",
        messageKey: identity
          ? "autoCheckin:providerFallback.nativePageIdentityMismatch"
          : "autoCheckin:providerFallback.nativePageIdentityMissing",
      })
      expect(clicked).not.toHaveBeenCalled()
    },
  )

  it("confirms a lost native action reply without clicking again", async () => {
    const { account, sendSiteAction } = prepareAccountSession("123", true)
    vi.mocked(newApiFamilyRequests.data)
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: true },
      })
    expect((await checkInForTest(account)).status).toBe("success")
    expect(
      sendSiteAction.mock.calls.filter(
        ([action]) =>
          action === RuntimeActionIds.ContentTriggerCheckinPageAction,
      ),
    ).toHaveLength(1)
  })

  it("does not click after execution intent is withdrawn during login", async () => {
    const { account, clicked } = prepareAccountSession()
    vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
      enabled: true,
      stats: { checked_in_today: false },
    })
    const beforeRecoveredMutation = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    await expect(
      checkInForTest(account, {
        ...DEFAULT_PROVIDER_CONTEXT,
        beforeRecoveredMutation,
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      reasonCode: "auto_checkin_disabled",
    })
    expect(clicked).not.toHaveBeenCalled()
  })

  it("uses the configured login directly when saved credentials cannot read status", async () => {
    const { account, sendSiteAction } = prepareAccountSession()
    vi.mocked(newApiFamilyRequests.envelope)
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: "123" },
      })
    vi.mocked(newApiFamilyRequests.data)
      .mockRejectedValueOnce(new ApiError("unauthorized", 401))
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      .mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: true },
      })
    expect(
      (
        await checkInForTest({
          ...account,
          account_info: { ...account.account_info, access_token: "" },
        })
      ).status,
    ).toBe("success")
    expect(newApiFamilyRequests.envelope).toHaveBeenCalledOnce()
    expect(
      sendSiteAction.mock.calls.filter(
        ([action]) =>
          action === RuntimeActionIds.ContentTriggerCheckinPageAction,
      ),
    ).toHaveLength(1)
  })
  it("can prepare a configured login without a saved API credential", () => {
    expect(
      newApiProvider.getReadiness({
        ...mockAccount,
        account_info: { ...mockAccount.account_info, access_token: "" },
        login: {
          methodId: "password",
          credentials: { username: "target", password: "fixture" },
        },
      }),
    ).toEqual({ ready: true })
  })
  it.each(["dynamic check-in requires page action", "Turnstile token invalid"])(
    "uses the target login and native page for %s",
    async (message) => {
      const sendSiteAction = vi.fn(async (action, details?) => {
        if (action === RuntimeActionIds.ContentNewApiDashboardSessionAuth)
          return {
            success: true,
            data: {
              access_token: "dashboard-target",
              token_type: "Bearer",
              access_expires_at: Date.now() / 1000 + 900,
              session: { sid: "target-session", current: true },
              user: { id: "123" },
            },
          }
        if (action === RuntimeActionIds.ContentGetUserFromLocalStorage)
          return { success: true, data: { userId: "123" } }
        if (typeof details === "function") await details()
        return {
          success: true,
          status: "clicked",
          clicked: true,
          reason: "clicked",
          verification: { status: "not_present" },
        }
      })
      const navigate = vi.fn(),
        waitForReadyPage = vi.fn(),
        setVerificationReason = vi.fn()
      login.loginAccount.mockImplementation(async (request) => {
        await request.onAuthenticated({
          tabId: 11,
          assertOrigin: async () => {},
          sendSiteAction,
          navigate,
          waitForReadyPage,
          setVerificationReason,
        })
        return { status: "authenticated", identity: "123" }
      })
      vi.mocked(newApiFamilyRequests.envelope)
        .mockResolvedValueOnce({ success: false, message, data: null })
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { id: "123" },
        })
      vi.mocked(newApiFamilyRequests.data)
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: false },
        })
        .mockResolvedValueOnce({
          enabled: true,
          stats: { checked_in_today: true },
        })
      const account = {
        ...mockAccount,
        login: {
          methodId: "password",
          credentials: { username: "target", password: "fixture" },
        },
      }
      const result = await checkInForTest(account)
      expect(result.status).toBe("success")
      expect(login.loginAccount).toHaveBeenCalledOnce()
      expect(navigate).toHaveBeenCalledWith(
        "https://site.example.invalid/console/personal",
      )
      expect(
        sendSiteAction.mock.calls.filter(
          ([action]) =>
            action === RuntimeActionIds.ContentTriggerCheckinPageAction,
        ),
      ).toHaveLength(1)
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
      expect(newApiFamilyRequests.data).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fetchContext: expect.objectContaining({ tabId: 11 }),
          auth: expect.objectContaining({ accessToken: "dashboard-target" }),
        }),
        expect.anything(),
      )
    },
  )
  beforeEach(() => {
    vi.resetAllMocks()
    mockFetchSupportCheckIn.mockResolvedValue(undefined)
    vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValue(
      "https://site.example.invalid/console/personal",
    )
    vi.mocked(safeRandomUUID).mockImplementation((prefix?: string) =>
      prefix ? `${prefix}-mock-uuid` : "mock-uuid",
    )
  })

  it("registers the shared provider for ModelFlare accounts", () => {
    expect(
      autoCheckinMethodRegistry.getCandidates(SITE_TYPES.MODELFLARE),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: newApiProvider }),
      ]),
    )
  })

  describe("getReadiness", () => {
    it("returns ready for a valid account", () => {
      expect(newApiProvider.getReadiness(mockAccount)).toEqual({ ready: true })
    })

    it("leaves automatic-execution intent to the Module", () => {
      const account = {
        ...mockAccount,
        checkIn: buildCheckInConfig(),
      }
      expect(newApiProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("explains when account data is missing", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, id: "" },
      }
      expect(newApiProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "account_data_missing",
      })
    })

    it("explains when saved credentials are missing", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.AccessToken,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(newApiProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "credentials_missing",
      })
    })

    it("treats missing authType as access-token auth", () => {
      const account = {
        ...mockAccount,
        authType: undefined as any,
      }
      expect(newApiProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("requires an access token when authType is missing", () => {
      const account = {
        ...mockAccount,
        authType: undefined as any,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(newApiProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "credentials_missing",
      })
    })

    it("allows cookie-auth accounts to check in without an access token", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(newApiProvider.getReadiness(account)).toEqual({ ready: true })
    })
  })

  describe("read-only status", () => {
    it.each([
      {
        error: new ApiError(
          "localized denial",
          200,
          "/api/user/checkin",
          API_ERROR_CODES.BUSINESS_ERROR,
          "AUTH_INSUFFICIENT_PRIVILEGE",
        ),
        reason: "permission_denied",
      },
      {
        error: new ApiError(
          "Permission denied. Insufficient privileges.",
          503,
          "/api/user/checkin",
          API_ERROR_CODES.BUSINESS_ERROR,
        ),
        reason: "source_unavailable",
      },
      {
        error: new Error("Permission denied. Insufficient privileges."),
        reason: "invalid_response",
      },
    ])(
      "preserves structured error evidence as $reason",
      async ({ error, reason }) => {
        vi.mocked(newApiFamilyRequests.data).mockRejectedValueOnce(error)
        await expect(
          newApiProvider.detect!({ account: mockAccount, observedAt: 202 }),
        ).resolves.toEqual({
          outcome: "unknown",
          reason,
          attemptedAt: 202,
        })
      },
    )

    it.each([
      "无权进行此操作，权限不足",
      "Permission denied. Insufficient privileges.",
    ])("classifies a message-only permission denial: %s", async (message) => {
      vi.mocked(newApiFamilyRequests.data).mockRejectedValueOnce(
        new ApiError(
          message,
          200,
          "/api/user/checkin",
          API_ERROR_CODES.BUSINESS_ERROR,
        ),
      )
      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 202 }),
      ).resolves.toEqual({
        outcome: "unknown",
        reason: "permission_denied",
        attemptedAt: 202,
      })
      expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
    })

    it("uses public site status to classify a disabled deployment independently of error copy", async () => {
      vi.mocked(newApiFamilyRequests.data).mockRejectedValueOnce(
        new ApiError(
          "check-in unavailable",
          undefined,
          "/api/user/checkin",
          API_ERROR_CODES.BUSINESS_ERROR,
        ),
      )
      mockFetchSupportCheckIn.mockResolvedValueOnce(false)

      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 199 }),
      ).resolves.toEqual({
        detection: {
          outcome: "matched",
          evidence: { source: "probe", observedAt: 199 },
        },
        status: {
          outcome: "known",
          availability: "disabled",
          evidence: { source: "probe", observedAt: 199 },
        },
      })
      expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: mockAccount.site_url,
          auth: expect.objectContaining({
            authType: AuthTypeEnum.AccessToken,
          }),
        }),
        undefined,
      )
    })

    it("does not misclassify other business errors while public status remains enabled", async () => {
      vi.mocked(newApiFamilyRequests.data).mockRejectedValueOnce(
        new ApiError(
          "failed to update quota",
          undefined,
          "/api/user/checkin",
          API_ERROR_CODES.BUSINESS_ERROR,
        ),
      )
      mockFetchSupportCheckIn.mockResolvedValueOnce(true)

      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 200 }),
      ).resolves.toEqual({
        outcome: "unknown",
        reason: "invalid_response",
        attemptedAt: 200,
      })
    })

    it("selects a valid disabled deployment without issuing POST", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        enabled: false,
        stats: { checked_in_today: false },
      } as any)

      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 200 }),
      ).resolves.toEqual({
        detection: {
          outcome: "matched",
          evidence: { source: "probe", observedAt: 200 },
        },
        status: {
          outcome: "known",
          availability: "disabled",
          today: "not_checked",
          evidence: { source: "probe", observedAt: 200 },
        },
      })
      expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
    })

    it("treats a malformed status envelope as unknown", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        enabled: true,
        stats: {},
      } as any)

      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 201 }),
      ).resolves.toEqual({
        outcome: "unknown",
        reason: "invalid_response",
        attemptedAt: 201,
      })
    })

    it("classifies an authenticated status read failure without hiding it", async () => {
      vi.mocked(newApiFamilyRequests.data).mockRejectedValueOnce(
        new ApiError("authentication required", 401),
      )

      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 202 }),
      ).resolves.toEqual({
        outcome: "unknown",
        reason: "authentication_required",
        attemptedAt: 202,
      })
    })
  })

  describe("deployment-renamed route", () => {
    const accountWithRoute = buildSiteAccount({
      ...mockAccount,
      checkIn: buildCheckInConfig({
        automaticExecutionEnabled: true,
        routeOverrides: {
          "new-api:daily-checkin": {
            path: "/api/user/daily-9f3k",
            source: "manual",
            observedAt: 1,
          },
        },
      }),
    })

    it("reads status from the account's own path", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      })
      mockFetchSupportCheckIn.mockResolvedValueOnce(true)

      await expect(
        newApiProvider.detect!({ account: accountWithRoute, observedAt: 700 }),
      ).resolves.toEqual({
        detection: {
          outcome: "matched",
          evidence: { source: "probe", observedAt: 700 },
        },
        status: {
          outcome: "known",
          availability: "enabled",
          today: "not_checked",
          evidence: { source: "probe", observedAt: 700 },
        },
      })
      expect(vi.mocked(newApiFamilyRequests.data).mock.calls[0]?.[1]).toEqual({
        endpoint: expect.stringMatching(/^\/api\/user\/daily-9f3k\?month=/),
      })
    })

    it("reports no availability when neither the body nor the public switch answers", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      })
      mockFetchSupportCheckIn.mockResolvedValueOnce(undefined)

      await expect(
        newApiProvider.detect!({ account: accountWithRoute, observedAt: 702 }),
      ).resolves.toEqual({
        detection: {
          outcome: "matched",
          evidence: { source: "probe", observedAt: 702 },
        },
        status: {
          outcome: "known",
          today: "checked",
          evidence: { source: "probe", observedAt: 702 },
        },
      })
    })

    it("posts the mutation to the account's own path", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: false },
      })
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: true,
        message: "ok",
        data: { quota_awarded: 10, checkin_date: formatLocalDayKey() },
      })

      await newApiProvider.checkIn(accountWithRoute, DEFAULT_PROVIDER_CONTEXT)

      expect(
        vi.mocked(newApiFamilyRequests.envelope).mock.calls[0]?.[1],
      ).toEqual({
        endpoint: "/api/user/daily-9f3k",
        options: { method: "POST", body: "{}" },
      })
    })

    it("keeps the canonical path and its strict payload for other accounts", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      })
      mockFetchSupportCheckIn.mockResolvedValueOnce(true)

      await expect(
        newApiProvider.detect!({ account: mockAccount, observedAt: 701 }),
      ).resolves.toEqual({
        outcome: "unknown",
        reason: "invalid_response",
        attemptedAt: 701,
      })
      expect(vi.mocked(newApiFamilyRequests.data).mock.calls[0]?.[1]).toEqual({
        endpoint: expect.stringMatching(/^\/api\/user\/checkin\?month=/),
      })
    })

    it.each([true, false])(
      "preserves candidate availability %s and cancellation without mutating",
      async (enabled) => {
        const signal = new AbortController().signal
        vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
          enabled,
          stats: { checked_in_today: false },
        })
        await expect(
          newApiProvider.probeRouteOverride!({
            account: mockAccount,
            path: "/api/user/custom",
            signal,
          }),
        ).resolves.toMatchObject({
          outcome: "known",
          availability: enabled ? "enabled" : "disabled",
          today: "not_checked",
        })
        expect(newApiFamilyRequests.data).toHaveBeenCalledWith(
          expect.anything(),
          {
            endpoint: expect.stringMatching(/^\/api\/user\/custom\?month=/),
            options: { signal },
          },
        )
        expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
      },
    )

    it("keeps status evidence when the public availability switch cannot be read", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      })
      mockFetchSupportCheckIn.mockRejectedValueOnce(new Error("offline"))
      await expect(
        newApiProvider.detect!({ account: accountWithRoute, observedAt: 703 }),
      ).resolves.toMatchObject({
        status: { outcome: "known", today: "not_checked" },
      })
    })

    it("does not fetch availability after the status request is cancelled", async () => {
      const controller = new AbortController()
      vi.mocked(newApiFamilyRequests.data).mockImplementationOnce(async () => {
        controller.abort()
        return { stats: { checked_in_today: false } }
      })
      await expect(
        newApiProvider.getStatus!({
          account: accountWithRoute,
          observedAt: 704,
          signal: controller.signal,
        }),
      ).resolves.toMatchObject({
        outcome: "known",
        today: "not_checked",
      })
      expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    })

    it("probes a candidate path without mutating", async () => {
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: true, records: [] },
      })

      await expect(
        newApiProvider.probeRouteOverride!({
          account: mockAccount,
          path: "/api/user/daily-9f3k",
        }),
      ).resolves.toEqual({
        outcome: "known",
        today: "checked",
        evidence: { source: "probe", observedAt: expect.any(Number) },
      })
      expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
      expect(vi.mocked(newApiFamilyRequests.data).mock.calls[0]?.[1]).toEqual({
        endpoint: expect.stringMatching(/^\/api\/user\/daily-9f3k\?month=/),
      })
    })

    it.each([
      { payload: { success: true, data: null } },
      { payload: { stats: {} } },
      { payload: { data: { checked_in_today: true } } },
    ])(
      "rejects a candidate path without a status body",
      async ({ payload }) => {
        vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce(payload)

        await expect(
          newApiProvider.probeRouteOverride!({
            account: mockAccount,
            path: "/api/user/decoy",
          }),
        ).resolves.toBeUndefined()
      },
    )

    it("treats a failed candidate probe as no evidence", async () => {
      vi.mocked(newApiFamilyRequests.data).mockRejectedValueOnce(
        new ApiError("not found", 404, "/api/user/decoy"),
      )

      await expect(
        newApiProvider.probeRouteOverride!({
          account: mockAccount,
          path: "/api/user/decoy",
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe("checkIn", () => {
    it("preserves the popup source through native page check-in and status polling", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "clicked",
          clicked: true,
          reason: "clicked",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://site.example.invalid/console/personal",
          },
        },
      })
      mockCheckInStatusSequence(false, true)

      const result = await checkInForTest(mockAccount, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      })

      expect(result).toEqual({
        status: "already_checked",
        messageKey: "autoCheckin:providerFallback.alreadyCheckedToday",
        data: expect.objectContaining({
          reason: "clicked",
        }),
      })
      expect(
        vi.mocked(newApiFamilyRequests.envelope).mock.calls[0]?.[0],
      ).toMatchObject({
        accountId: "test-id",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: expect.objectContaining({
          kind: "user_command",
          command: "manual_checkin",
          surface: "options",
        }),
      })
      expect(
        vi.mocked(newApiFamilyRequests.data).mock.calls[0]?.[0],
      ).toMatchObject({
        accountId: "test-id",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: expect.objectContaining({
          kind: "user_command",
          command: "manual_checkin",
          surface: "options",
        }),
      })
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          originUrl: "https://site.example.invalid",
          pageUrl: "https://site.example.invalid/console/personal",
          siteType: SITE_TYPES.NEW_API,
          expectedUserId: "123",
          accountId: "test-id",
          authType: AuthTypeEnum.AccessToken,
          trigger: { kind: "checkinButton" },
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          protectionBypassExecution: expect.objectContaining({
            kind: "user_command",
            command: "manual_checkin",
            surface: "options",
          }),
        }),
      )
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it.each([true, false])(
      "retains only today's reward from native page polling (today: %s)",
      async (isToday) => {
        vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
          success: false,
          message: "missing check-in signature header",
          data: null,
        })
        vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
          success: true,
          reason: "clicked",
          identity: { userId: "123", user: { id: "123" } },
        })
        mockCheckInStatusSequence(false)
        vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
          enabled: true,
          stats: {
            checked_in_today: true,
            records: [
              {
                checkin_date: formatLocalDayKey(
                  isToday
                    ? new Date()
                    : new Date(Date.now() - 48 * 60 * 60 * 1000),
                ),
                quota_awarded: 500_000,
              },
            ],
          },
        } as any)
        const result = await checkInForTest(mockAccount)
        expect(result.status).toBe(CHECKIN_RESULT_STATUS.ALREADY_CHECKED)
        expect(result.reward).toEqual(isToday ? { quota: 500_000 } : undefined)
        expect(newApiFamilyRequests.data).toHaveBeenCalledTimes(2)
      },
    )

    it("uses native page check-in for generic check-in API failures", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "server rejected the check-in request",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      mockCheckInStatusSequence(false, true)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("does not treat unrelated authority errors as auth blocks for native fallback", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "upstream authority rejected the dynamic signature",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      mockCheckInStatusSequence(false, true)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
    })

    it("keeps native page action request ids scoped to each provider attempt", async () => {
      vi.mocked(safeRandomUUID)
        .mockReturnValueOnce("native-checkin-test-id-first")
        .mockReturnValueOnce("native-checkin-test-id-second")
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      mockCheckInStatusSequence(false, true, false, true)

      await checkInForTest(mockAccount)
      await checkInForTest(mockAccount)

      const requestIds = vi
        .mocked(tempWindowTriggerCheckinPageAction)
        .mock.calls.map(([params]) => params.requestId)

      expect(safeRandomUUID).toHaveBeenCalledWith("native-checkin-test-id")
      expect(requestIds).toEqual([
        "native-checkin-test-id-first",
        "native-checkin-test-id-second",
      ])
    })

    it("keeps a failed response when public site status reports check-in disabled", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "check-in unavailable",
        data: null,
      })
      mockFetchSupportCheckIn.mockResolvedValueOnce(false)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "method_disabled",
        messageKey: "autoCheckin:providerWong.checkinDisabled",
        rawMessage: "check-in unavailable",
        data: {
          success: false,
          message: "check-in unavailable",
          data: null,
        },
      })
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("keeps a pre-dispatch error failed when public status disables check-in", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockRejectedValueOnce(
        new Error("missing check-in signature header"),
      )
      mockFetchSupportCheckIn.mockResolvedValueOnce(false)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "upstream_error",
        rawMessage: "missing check-in signature header",
        messageKey: undefined,
      })
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it.each([
      ["check-in endpoint unsupported", "no_provider"],
      ["unauthorized check-in request", "authentication_required"],
      ["authentication required for check-in", "authentication_required"],
      ["authenticate before check-in", "authentication_required"],
      ["permission denied for check-in", "permission_denied"],
      ["rate limit exceeded for check-in", "upstream_error"],
      ["too many requests for check-in", "upstream_error"],
    ])(
      "does not use native page check-in for blocked failure message: %s",
      async (message, expectedReason) => {
        vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
          success: false,
          message,
          data: null,
        })

        const result = await checkInForTest(mockAccount)

        expect(result).toEqual({
          status: "failed",
          reasonCode: expectedReason,
          rawMessage: message,
          messageKey: undefined,
          data: {
            success: false,
            message,
            data: null,
          },
        })
        expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
        expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
      },
    )

    it("does not use native page check-in when the API endpoint rejects POST with 405", async () => {
      const error = new ApiError("请求失败: 405", 405, "/api/user/checkin")

      vi.mocked(newApiFamilyRequests.envelope).mockRejectedValueOnce(error)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "no_provider",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("refuses native page check-in when temp page identity is missing", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMissing,
        identity: null,
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "authentication_required",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMissing",
        messageParams: {
          checkInUrl: "https://site.example.invalid/console/personal",
        },
        rawMessage: undefined,
        data: {
          success: false,
          reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMissing,
          identity: null,
        },
      })
    })

    it("refuses native page check-in when temp page identity does not match", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMismatch,
        identity: { userId: "456", user: { id: "456" } },
        expectedUserId: "123",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "authentication_required",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMismatch",
        messageParams: {
          checkInUrl: "https://site.example.invalid/console/personal",
        },
        rawMessage: undefined,
        data: expect.objectContaining({
          reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMismatch,
          expectedUserId: "123",
        }),
      })
    })

    it("returns manual-required messaging when native page trigger target is missing", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TargetNotFound,
        identity: { userId: "123", user: { id: "123" } },
        trigger: {
          status: "target_not_found",
          clicked: false,
          reason: "noTarget",
          detection: {
            hasTurnstile: false,
            reasons: [],
            score: 0,
            title: "Check in",
            url: "https://site.example.invalid/console/personal",
          },
        },
      })

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageTargetNotFound",
      )
      expect(result.messageParams).toEqual({
        checkInUrl: "https://site.example.invalid/console/personal",
      })
      expect(result.rawMessage).toBeUndefined()
    })

    it("maps throttled native page actions to trigger failure messaging", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: "throttled",
        error: "native action recently attempted",
        identity: { userId: "123", user: { id: "123" } },
      })

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageTriggerFailed",
      )
      expect(result.messageParams).toEqual({
        checkInUrl: "https://site.example.invalid/console/personal",
      })
      expect(result.rawMessage).toBe("native action recently attempted")
      expect(result.rawMessage).not.toBe("missing check-in signature header")
    })

    it("returns native trigger failure messaging when native page action rejects after response signature failure", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "missing check-in signature header",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockRejectedValueOnce(
        new Error("temp window closed"),
      )

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        reasonCode: "checkin_page_unavailable",
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageTriggerFailed",
        messageParams: {
          checkInUrl: "https://site.example.invalid/console/personal",
        },
        rawMessage: "temp window closed",
      })
    })

    it("returns manual-required messaging when native click is not confirmed by status polling", async () => {
      vi.useFakeTimers()

      try {
        vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
          success: false,
          message: "missing check-in signature header",
          data: null,
        })
        vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
          success: true,
          reason: "clicked",
          identity: { userId: "123", user: { id: "123" } },
          trigger: {
            status: "clicked",
            clicked: true,
            reason: "clicked",
            detection: {
              hasTurnstile: false,
              reasons: [],
              score: 0,
              title: "Check in",
              url: "https://site.example.invalid/console/personal",
            },
          },
        })
        vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
          stats: { checked_in_today: false },
        } as any)

        const resultPromise = checkInForTest(mockAccount)
        await vi.advanceTimersByTimeAsync(9_000)
        const result = await resultPromise

        expect(result.status).toBe("failed")
        expect(result.reasonCode).toBe("checkin_unconfirmed")
        // Whether that may be retried is the policy's decision, asserted in
        // resultPolicy.test.ts from the reason code alone.
        expect(result.messageKey).toBe(
          "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
        )
        expect(result.messageParams).toEqual({
          checkInUrl: "https://site.example.invalid/console/personal",
        })
        expect(result.rawMessage).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it.each([
      ["required", false, "failed", "manual_verification_required"],
      ["completed", false, "failed", "checkin_unconfirmed"],
      ["required", true, "already_checked", undefined],
    ] as const)(
      "classifies native verification %s with checked-in status %s using server evidence",
      async (
        verificationStatus,
        checkedInToday,
        expectedStatus,
        expectedReason,
      ) => {
        vi.useFakeTimers()
        try {
          vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
            success: false,
            message: "missing check-in signature header",
            data: null,
          })
          vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
            success: true,
            reason: "clicked",
            trigger: {
              status: "clicked",
              clicked: true,
              reason: "clicked",
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: null,
              },
              verification: {
                status: verificationStatus,
                provider: "hcaptcha",
              },
            },
          })
          vi.mocked(newApiFamilyRequests.data).mockResolvedValue({
            stats: { checked_in_today: checkedInToday },
          } as any)
          const pending = checkInForTest(mockAccount)
          await vi.advanceTimersByTimeAsync(9_000)
          const result = await pending
          expect(result.status).toBe(expectedStatus)
          expect(result.reasonCode).toBe(expectedReason)
          if (!checkedInToday) {
            expect(result.messageKey).toBe(
              verificationStatus === "required"
                ? "autoCheckin:providerFallback.nativePageVerificationRequired"
                : "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
            )
            expect(result.messageParams).toEqual({
              checkInUrl: "https://site.example.invalid/console/personal",
            })
          }
        } finally {
          vi.useRealTimers()
        }
      },
    )

    it("does not add native page identity matching to Turnstile replay failures", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "timeout", hasTurnstile: true },
      })
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("failed")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
    })

    it("uses native page check-in for thrown dynamic signature errors", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockRejectedValueOnce(
        new Error("missing check-in signature header"),
      )
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: true,
        reason: "clicked",
        identity: { userId: "123", user: { id: "123" } },
      })
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: true },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
    })

    it("reports today's award on an already-checked row from the month records it already fetches", async () => {
      const today = formatLocalDayKey()
      const yesterday = formatLocalDayKey(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
      )
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "今日已签到",
        data: null,
      })
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        enabled: true,
        stats: {
          checked_in_today: true,
          records: [
            { checkin_date: today, quota_awarded: 500_000 },
            { checkin_date: yesterday, quota_awarded: 250_000 },
          ],
        },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("already_checked")
      // Only today's record counts; an older day's award must not be shown.
      expect(result.reward).toEqual({ quota: 500_000 })
    })

    it("omits the reward on an already-checked row without a record for today", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "今日已签到",
        data: null,
      })
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        enabled: true,
        stats: {
          checked_in_today: true,
          records: [
            {
              checkin_date: formatLocalDayKey(
                new Date(Date.now() - 24 * 60 * 60 * 1000),
              ),
              quota_awarded: 250_000,
            },
          ],
        },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(result.reward).toBeUndefined()
    })

    it("does not start a second mutation after a dispatched request loses its result", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockRejectedValueOnce(
        new Error("missing check-in signature header"),
      )
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      mutationLifecycle.onDispatch()

      const result = await checkInForTest(mockAccount, {
        ...DEFAULT_PROVIDER_CONTEXT,
        mutationLifecycle,
      })

      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        rawMessage: "missing check-in signature header",
      })
      expect(newApiFamilyRequests.data).not.toHaveBeenCalled()
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("returns native trigger failure messaging when native page action rejects after thrown signature error", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockRejectedValueOnce(
        new Error("missing check-in signature header"),
      )
      vi.mocked(tempWindowTriggerCheckinPageAction).mockRejectedValueOnce(
        new Error("native page unavailable"),
      )

      await expect(checkInForTest(mockAccount)).resolves.toEqual({
        status: "failed",
        reasonCode: "checkin_page_unavailable",
        messageKey: "autoCheckin:providerFallback.nativePageTriggerFailed",
        messageParams: {
          checkInUrl: "https://site.example.invalid/console/personal",
        },
        rawMessage: "native page unavailable",
      })
    })

    it("returns the default success message key when the upstream check-in succeeds without a message", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { checkin_date: "2026-01-01", quota_awarded: 1 },
      })
      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "success",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
        reward: { quota: 1 },
        data: { checkin_date: "2026-01-01", quota_awarded: 1 },
      })
      expect(
        vi.mocked(newApiFamilyRequests.envelope).mock.calls[0]?.[0],
      ).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      })
    })

    it("treats upstream already-checked responses as already_checked results", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "今日已签到",
        data: { checkin_date: "2026-01-01" },
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        rawMessage: "今日已签到",
        data: { checkin_date: "2026-01-01" },
      })
    })

    it("uses status readback to recognize already checked independently of error copy", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "No action is necessary today",
        data: null,
      })
      mockFetchSupportCheckIn.mockResolvedValueOnce(true)
      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        enabled: true,
        stats: { checked_in_today: true },
      } as any)

      await expect(checkInForTest(mockAccount)).resolves.toEqual({
        status: "already_checked",
        rawMessage: "No action is necessary today",
        data: null,
      })
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("uses an incognito Turnstile temp context first for access-token accounts", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: true,
          message: "签到成功",
          data: { checkin_date: "2026-01-01", quota_awarded: 1 },
        },
        turnstile: { status: "token_obtained", hasTurnstile: true },
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(true)

      const account = {
        ...mockAccount,
        checkIn: {
          ...mockAccount.checkIn,
          customCheckIn: { url: "https://site.example.invalid/custom-checkin" },
        },
      }

      const result = await checkInForTest(account)

      expect(result.status).toBe("success")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          originUrl: "https://site.example.invalid",
          pageUrl: "https://site.example.invalid/console/personal",
          fetchUrl: "https://site.example.invalid/api/user/checkin",
          responseType: "json",
          authType: AuthTypeEnum.AccessToken,
          useIncognito: true,
          turnstileTimeoutMs: 12000,
          turnstilePreTrigger: { kind: "checkinButton" },
        }),
      )
    })

    it("uses the theme-aware New API route for Turnstile-assisted verification pages", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
      vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValueOnce(
        "https://site.example.invalid/profile",
      )
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "need manual verification",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      await checkInForTest(mockAccount)

      expect(resolveAccountSiteRouteUrl).toHaveBeenCalledWith(
        {
          baseUrl: "https://site.example.invalid",
          siteType: SITE_TYPES.NEW_API,
        },
        SITE_ROUTE_KINDS.CheckIn,
      )
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          pageUrl: "https://site.example.invalid/profile",
        }),
      )
    })

    it("falls back to normal Turnstile temp context when access-token incognito access is unavailable", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: true,
          message: "签到成功",
          data: { checkin_date: "2026-01-01", quota_awarded: 1 },
        },
        turnstile: { status: "token_obtained", hasTurnstile: true },
      })

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("success")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.not.objectContaining({ useIncognito: true }),
      )
    })

    it("defaults missing authType to AccessToken for direct check-in requests", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: true,
        message: "签到成功",
        data: { checkin_date: "2026-01-01", quota_awarded: 1 },
      })

      await checkInForTest({
        ...mockAccount,
        authType: undefined as any,
      })

      expect(newApiFamilyRequests.envelope).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            authType: AuthTypeEnum.AccessToken,
          }),
        }),
        expect.any(Object),
      )
    })

    it("reports the awarded quota as the check-in reward", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: true,
        message: "签到成功",
        data: { checkin_date: "2026-01-01", quota_awarded: 500000 },
      })

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("success")
      expect(result.reward).toEqual({ quota: 500000 })
    })

    it("omits the reward when the success payload carries no awarded quota", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: true,
        message: "签到成功",
        data: { checkin_date: "2026-01-01" },
      })

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("success")
      expect(result.reward).toBeUndefined()
    })

    it("uses cookie-auth temp-context options when Turnstile assistance runs for cookie-auth accounts", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "need manual verification",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=abc" },
        account_info: { ...mockAccount.account_info, access_token: "" },
        checkIn: {
          ...mockAccount.checkIn,
          customCheckIn: {
            turnstilePreTrigger: {
              kind: "clickSelector" as const,
              selector: "#checkin",
            },
          },
        },
      }

      await checkInForTest(account)

      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          cookieAuthSessionCookie: "session=abc",
          turnstilePreTrigger: {
            kind: "clickSelector",
            selector: "#checkin",
          },
          fetchOptions: expect.objectContaining({
            credentials: "include",
          }),
        }),
      )
      expect(tempWindowTurnstileFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchOptions: expect.objectContaining({
            headers: expect.not.objectContaining({
              Authorization: expect.anything(),
            }),
          }),
        }),
      )
    })

    it("returns manual-required messaging with the site check-in URL when Turnstile token cannot be obtained", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile 校验失败，请刷新重试！",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const account = {
        ...mockAccount,
        checkIn: {
          ...mockAccount.checkIn,
          customCheckIn: { url: "https://site.example.invalid/custom-checkin" },
        },
      }

      const result = await checkInForTest(account)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.nativePageVerificationRequired",
      )
      expect(result.messageParams?.checkInUrl).toBe(
        "https://site.example.invalid/console/personal",
      )
    })

    it("returns already-checked when Turnstile token is missing but status confirms checked_in_today", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "not_present", hasTurnstile: false },
      })

      mockCheckInStatusSequence(false, true)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("already_checked")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.alreadyCheckedToday",
      )
    })

    it("returns manual-required when Turnstile assistance succeeds but still cannot obtain a usable token", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: false,
          message: "",
          data: null,
        },
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey:
          "autoCheckin:providerFallback.nativePageVerificationRequired",
        messageParams: {
          checkInUrl: "https://site.example.invalid/console/personal",
        },
        reasonCode: "manual_verification_required",
        rawMessage: "Turnstile token invalid",
        data: {
          success: false,
          message: "",
          data: null,
        },
      })
    })

    it("returns already-checked when assisted success payload still shows a non-token-obtained Turnstile status", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: false,
          message: "manual confirmation",
          data: { checkin_date: "2026-01-01" },
        },
        turnstile: { status: "timeout", hasTurnstile: true },
      })

      mockCheckInStatusSequence(false, true)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        messageKey: "autoCheckin:providerFallback.alreadyCheckedToday",
        data: {
          success: false,
          message: "manual confirmation",
          data: { checkin_date: "2026-01-01" },
        },
      })
    })

    it("surfaces the assisted backend failure when Turnstile replay returns a concrete rejection without widget status", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: {
          success: false,
          message: "daily quota exhausted",
          data: null,
        },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "upstream_error",
        rawMessage: "daily quota exhausted",
        messageKey: undefined,
        data: {
          success: false,
          message: "daily quota exhausted",
          data: null,
        },
      })
      expect(newApiFamilyRequests.data).toHaveBeenCalledTimes(1)
    })

    it("falls back to the generic failure key when assisted replay returns no usable payload", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile verify failed",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: true,
        status: 200,
        headers: {},
        data: undefined,
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "upstream_error",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: undefined,
      })
      expect(newApiFamilyRequests.data).toHaveBeenCalledTimes(1)
    })

    it("falls back to a generic failure when assisted Turnstile fetch fails after token capture without an explicit error", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        turnstile: { status: "token_obtained", hasTurnstile: true },
      } as any)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        reasonCode: "upstream_error",
        status: "failed",
        rawMessage: "Turnstile token invalid",
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          success: false,
          turnstile: { status: "token_obtained", hasTurnstile: true },
        },
      })
    })

    it("uses the assisted error directly when token capture succeeds but replay still fails", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "server rejected assisted replay",
        turnstile: { status: "token_obtained", hasTurnstile: true },
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        reasonCode: "upstream_error",
        status: "failed",
        rawMessage: "server rejected assisted replay",
        messageKey: undefined,
        data: {
          success: false,
          error: "server rejected assisted replay",
          turnstile: { status: "token_obtained", hasTurnstile: true },
        },
      })
    })

    it("preserves the popup source across preferred and fallback Turnstile attempts", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch)
        .mockResolvedValueOnce({
          success: false,
          error: "Turnstile token not available",
          turnstile: { status: "not_present", hasTurnstile: false },
        })
        .mockResolvedValueOnce({
          success: true,
          status: 200,
          headers: {},
          data: {
            success: true,
            message: "签到成功",
            data: { checkin_date: "2026-01-01", quota_awarded: 1 },
          },
          turnstile: { status: "token_obtained", hasTurnstile: true },
        })

      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(true)

      const result = await checkInForTest(mockAccount, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      })

      expect(result.status).toBe("success")
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(2)
      expect(tempWindowTurnstileFetch).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          useIncognito: true,
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        }),
      )
      expect(tempWindowTurnstileFetch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        }),
      )
      expect(
        vi.mocked(tempWindowTurnstileFetch).mock.calls[1]?.[0].useIncognito,
      ).toBeUndefined()
      expect(
        vi.mocked(newApiFamilyRequests.envelope).mock.calls[0]?.[0],
      ).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
      expect(
        vi.mocked(newApiFamilyRequests.data).mock.calls[0]?.[0],
      ).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
    })

    it("falls back to manual verification when the incognito retry still cannot complete the assisted request", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch)
        .mockResolvedValueOnce({
          success: false,
          error: "Turnstile token not available",
          turnstile: { status: "not_present", hasTurnstile: false },
        })
        .mockResolvedValueOnce({
          success: false,
          error: "incognito replay failed",
          turnstile: { status: "error", hasTurnstile: true },
        })

      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)
      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(true)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey:
          "autoCheckin:providerFallback.nativePageVerificationRequired",
        messageParams: {
          checkInUrl: "https://site.example.invalid/console/personal",
        },
        reasonCode: "manual_verification_required",
        rawMessage: "Turnstile token not available",
        data: {
          success: false,
          error: "Turnstile token not available",
          turnstile: { status: "not_present", hasTurnstile: false },
        },
      })
    })

    it("prompts to enable incognito access when incognito retry is needed but extension is not allowed in incognito", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token 为空",
        data: null,
      })

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce({
        success: false,
        error: "Turnstile token not available",
        turnstile: { status: "not_present", hasTurnstile: false },
      })

      vi.mocked(newApiFamilyRequests.data).mockResolvedValueOnce({
        stats: { checked_in_today: false },
      } as any)

      vi.mocked(isAllowedIncognitoAccess).mockResolvedValueOnce(false)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
      )
      expect(result.messageParams?.checkInUrl).toBe(
        "https://site.example.invalid/console/personal",
      )
      expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
    })

    it("does not trigger Turnstile flow for non-Turnstile failures", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Something went wrong",
        data: null,
      })
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValueOnce({
        success: false,
        reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TargetNotFound,
        identity: { userId: "123", user: { id: "123" } },
      })

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("failed")
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledTimes(1)
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("does not treat every Turnstile mention as a Turnstile-required failure", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile challenge rendered on page",
        data: { reason: "manual step still needed" },
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "manual_verification_required",
        rawMessage: "Turnstile challenge rendered on page",
        messageKey: undefined,
        data: {
          success: false,
          message: "Turnstile challenge rendered on page",
          data: { reason: "manual step still needed" },
        },
      })
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
    })

    it("maps endpoint-style errors from the direct request to endpoint-not-supported", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockRejectedValueOnce({
        statusCode: 404,
        message: "Not found",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
        reasonCode: "no_provider",
      })
    })

    it("returns a generic failed result when the Turnstile-assisted fetch cannot start", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Turnstile token invalid",
        data: null,
      })
      vi.mocked(tempWindowTurnstileFetch).mockResolvedValueOnce(null as any)

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        reasonCode: "checkin_page_unavailable",
        status: "failed",
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        rawMessage: "Turnstile token invalid",
        data: undefined,
      })
    })

    it("uses the generic failure key when the direct request fails without any upstream message", async () => {
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: false,
        message: "",
        data: { details: "unknown failure" },
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        reasonCode: "upstream_error",
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          success: false,
          message: "",
          data: { details: "unknown failure" },
        },
      })
    })
  })
})
