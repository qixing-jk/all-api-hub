import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { xingyaProvider } from "~/services/checkin/autoCheckin/providers/xingya"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    envelope: vi.fn(),
  },
}))
const login = vi.hoisted(() => ({ loginAccount: vi.fn() }))
vi.mock("~/services/accountLogin", () => login)

/** Live status payload from https://xingya.site/api/user/xingya-checkin (2026-10-25). */
const liveStatusData = {
  claim_enabled: true,
  claim_round: 0,
  group: "签到-福利分组",
  group_accessible: true,
  max_reward: 15,
  min_reward: 5,
  month: "2026-10",
  month_quota: 69350,
  records: [
    {
      checkin_date: "2026-10-25",
      quota_awarded: 69350,
      source: "checkin",
    },
  ],
  today: "2026-10-25",
  today_record: { checked_in: true, quota_awarded: 69350, source: "checkin" },
  wallet: { available: 69350 },
}

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "星芽",
  site_url: "https://xingya.site",
  site_type: SITE_TYPES.NEW_API,
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: "7451",
    access_token: "token",
    username: "Kayoko1703",
    quota: 500000,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: Date.now(),
  created_at: Date.now(),
  updated_at: Date.now(),
  user_updated_at: Date.now(),
}

const DEFAULT_PROVIDER_CONTEXT = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
} as const

const requestModule = async () =>
  (await import("~/services/apiService/newApiFamily/request"))
    .newApiFamilyRequests

const sessionAccount = (): SiteAccount => ({
  ...mockAccount,
  account_info: { ...mockAccount.account_info, access_token: "" },
  login: {
    methodId: "password",
    credentials: { username: "test", password: "fixture-password" },
  },
})

function prepareLoginSession(identity: string | null = "7451") {
  const sendSiteAction = vi.fn().mockResolvedValue({
    success: true,
    data: {
      access_token: "dashboard-bearer",
      token_type: "Bearer",
      access_expires_at: Date.now() / 1000 + 900,
      session: { sid: "session-a", current: true },
      user: { id: identity },
    },
  })
  login.loginAccount.mockImplementation(async (request) => {
    await request.onAuthenticated({
      tabId: 11,
      sendSiteAction,
      assertOrigin: async () => {},
      navigate: async () => {},
    })
    return { status: "authenticated", identity: "7451" }
  })
  return sendSiteAction
}

describe("xingyaProvider", () => {
  it.each([
    {
      response: { success: false, code: "AUTH_SESSION_REQUIRED" },
      expected: { reasonCode: "authentication_required" },
    },
    {
      response: { success: false },
      expected: {
        reasonCode: "upstream_rejected",
        messageKey: "autoCheckin:providerFallback.checkinFailed",
      },
    },
    {
      response: {
        success: true,
        message: "Already claimed",
        data: { already_claimed: true, quota_awarded: 100 },
      },
      expected: { status: "already_checked", rawMessage: "Already claimed" },
    },
    {
      response: {
        success: true,
        message: "Claimed",
        data: { already_claimed: false, quota_awarded: 100 },
      },
      expected: { status: "success", rawMessage: "Claimed" },
    },
  ])(
    "preserves the claim outcome and site copy for $response",
    async ({ response, expected }) => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce(response as any)
      await expect(
        xingyaProvider.checkIn(mockAccount, DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject(expected)
    },
  )
  it("cannot discover or fetch a status without an account or request", async () => {
    const requests = await requestModule()
    vi.mocked(requests.envelope).mockReset()
    await expect(
      xingyaProvider.getStatus!({ observedAt: 100 }),
    ).resolves.toBeUndefined()
    const detection = await xingyaProvider.detect!({ observedAt: 100 })
    expect(detection).toMatchObject({ outcome: "unknown" })
    expect(requests.envelope).not.toHaveBeenCalled()
  })
  it.each([
    ["session_busy", undefined, "session_busy"],
    ["failed", "verification_required", "manual_verification_required"],
    ["failed", undefined, "authentication_required"],
  ])(
    "does not claim after login returns %s / %s",
    async (status, reason, reasonCode) => {
      login.loginAccount.mockResolvedValue({ status, reason })
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockReset()
      await expect(
        xingyaProvider.checkIn(sessionAccount(), DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject({ reasonCode })
      expect(requests.envelope).not.toHaveBeenCalled()
    },
  )

  it("keeps a dispatched claim uncertain when the login session ends before completion", async () => {
    const mutationLifecycle = createAutoCheckinMutationLifecycle()
    login.loginAccount.mockImplementation(async () => {
      mutationLifecycle.onDispatch()
      return { status: "cancelled" }
    })
    await expect(
      xingyaProvider.checkIn(sessionAccount(), {
        ...DEFAULT_PROVIDER_CONTEXT,
        mutationLifecycle,
      }),
    ).resolves.toMatchObject({
      status: "uncertain",
      reasonCode: "checkin_unconfirmed",
    })
  })

  it("reports a session transport failure before claiming", async () => {
    prepareLoginSession().mockRejectedValue(new Error("session unavailable"))
    const requests = await requestModule()
    vi.mocked(requests.envelope).mockReset()
    await expect(
      xingyaProvider.checkIn(sessionAccount(), DEFAULT_PROVIDER_CONTEXT),
    ).resolves.toMatchObject({ status: "failed" })
    expect(requests.envelope).not.toHaveBeenCalled()
  })

  it("does not read status using a saved Cookie without its target login", async () => {
    const requests = await requestModule()
    vi.mocked(requests.envelope).mockReset()
    await expect(
      xingyaProvider.getStatus!({
        account: { ...mockAccount, authType: AuthTypeEnum.Cookie },
        observedAt: 100,
      }),
    ).resolves.toBeUndefined()
    expect(requests.envelope).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses the configured target login session for a claim without saved API credentials", async () => {
    const requests = await requestModule()
    const sendSiteAction = prepareLoginSession()
    vi.mocked(requests.envelope)
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: "7451" },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          ...liveStatusData,
          today_record: { checked_in: false, quota_awarded: 0 },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { already_claimed: false, quota_awarded: 69350 },
      })
    const account = {
      ...mockAccount,
      account_info: { ...mockAccount.account_info, access_token: "" },
      login: {
        methodId: "password" as const,
        credentials: { username: "test", password: "fixture-password" },
      },
    }
    const result = await xingyaProvider.checkIn(
      account,
      DEFAULT_PROVIDER_CONTEXT,
    )
    expect(result).toMatchObject({
      status: "success",
      reward: { quota: 69350 },
    })
    expect(login.loginAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        methodId: "password",
        onAuthenticated: expect.any(Function),
      }),
    )
    expect(requests.envelope).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "dashboard-bearer" }),
        fetchContext: expect.objectContaining({ tabId: 11 }),
      }),
      expect.objectContaining({ endpoint: "/api/user/xingya-daily-claim" }),
    )
    expect(sendSiteAction).toHaveBeenCalledTimes(1)
  })

  it("confirms a lost claim response in the same session without replaying the claim", async () => {
    prepareLoginSession()
    const requests = await requestModule()
    vi.mocked(requests.envelope)
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: "7451" },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          ...liveStatusData,
          today_record: { checked_in: false, quota_awarded: 0 },
        },
      })
      .mockImplementationOnce(async (request) => {
        request.observer?.onDispatch()
        throw new Error("Failed to fetch")
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: liveStatusData,
      })
    const result = await xingyaProvider.checkIn(sessionAccount(), {
      ...DEFAULT_PROVIDER_CONTEXT,
      mutationLifecycle: createAutoCheckinMutationLifecycle(),
    })
    expect(result).toMatchObject({
      status: "success",
      reward: { quota: 69350 },
    })
    expect(
      vi
        .mocked(requests.envelope)
        .mock.calls.filter(
          ([, operation]) =>
            operation.endpoint === "/api/user/xingya-daily-claim",
        ),
    ).toHaveLength(1)
  })

  it.each([
    { response: {}, checked: true },
    { response: null, checked: true },
    { response: { success: "true" }, checked: false },
    { response: {}, checked: false },
  ])(
    "reconciles malformed claim $response only through readback (checked=$checked)",
    async ({ response, checked }) => {
      prepareLoginSession()
      const requests = await requestModule()
      vi.mocked(requests.envelope)
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { id: "7451" },
        })
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { ...liveStatusData, today_record: { checked_in: false } },
        })
        // The transport preserves successful HTTP JSON for provider classification.
        .mockResolvedValueOnce(response as never)
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: {
            ...liveStatusData,
            today_record: {
              ...liveStatusData.today_record,
              checked_in: checked,
            },
          },
        })

      await expect(
        xingyaProvider.checkIn(sessionAccount(), DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject(
        checked
          ? { status: "success", reward: { quota: 69350 } }
          : { status: "uncertain", reasonCode: "checkin_unconfirmed" },
      )
      expect(
        vi
          .mocked(requests.envelope)
          .mock.calls.map(([, operation]) => operation.endpoint),
      ).toEqual([
        "/api/user/self",
        "/api/user/xingya-checkin",
        "/api/user/xingya-daily-claim",
        "/api/user/xingya-checkin",
      ])
    },
  )

  it.each([
    ["already checked", { ...liveStatusData }, "already_checked"],
    [
      "disabled",
      {
        ...liveStatusData,
        claim_enabled: false,
        today_record: { checked_in: false },
      },
      "failed",
    ],
    ["unknown", {}, "failed"],
  ])(
    "does not claim when login-session status is %s",
    async (_label, status, expected) => {
      prepareLoginSession()
      const requests = await requestModule()
      vi.mocked(requests.envelope)
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { id: "7451" },
        })
        .mockResolvedValueOnce({ success: true, message: "", data: status })
      expect(
        (
          await xingyaProvider.checkIn(
            sessionAccount(),
            DEFAULT_PROVIDER_CONTEXT,
          )
        ).status,
      ).toBe(expected)
      expect(requests.envelope).toHaveBeenCalledTimes(2)
    },
  )

  it("never claims using another account's dashboard bearer", async () => {
    prepareLoginSession("another-account")
    const requests = await requestModule()
    vi.mocked(requests.envelope).mockReset()
    await expect(
      xingyaProvider.checkIn(sessionAccount(), DEFAULT_PROVIDER_CONTEXT),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "authentication_required",
      messageKey: "autoCheckin:providerFallback.nativePageIdentityMismatch",
    })
    expect(requests.envelope).not.toHaveBeenCalled()
  })

  it.each([null, ""])(
    "reports missing identity in the dashboard session (%s)",
    async (identity) => {
      prepareLoginSession(identity)
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockReset()
      await expect(
        xingyaProvider.checkIn(sessionAccount(), DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMissing",
      })
      expect(requests.envelope).not.toHaveBeenCalled()
    },
  )

  it.each([{}, { id: "" }])(
    "does not claim or report an account mismatch when identity is missing ($id)",
    async (identity) => {
      prepareLoginSession()
      const requests = await requestModule()
      vi.mocked(requests.envelope)
        .mockReset()
        .mockResolvedValueOnce({ success: true, message: "", data: identity })
      await expect(
        xingyaProvider.checkIn(sessionAccount(), DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject({
        status: "failed",
        reasonCode: "authentication_required",
        messageKey: "autoCheckin:providerFallback.nativePageIdentityMissing",
      })
      expect(requests.envelope).toHaveBeenCalledTimes(1)
    },
  )

  it("rechecks execution intent after login before claiming", async () => {
    prepareLoginSession()
    const requests = await requestModule()
    vi.mocked(requests.envelope)
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: "7451" },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { ...liveStatusData, today_record: { checked_in: false } },
      })
    await expect(
      xingyaProvider.checkIn(sessionAccount(), {
        ...DEFAULT_PROVIDER_CONTEXT,
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toMatchObject({ reasonCode: "auto_checkin_disabled" })
    expect(requests.envelope).toHaveBeenCalledTimes(2)
  })

  describe("getReadiness", () => {
    it("requires complete credentials for configured password login", () => {
      expect(
        xingyaProvider.getReadiness({
          ...sessionAccount(),
          login: { methodId: "password" },
        }),
      ).toEqual({ ready: false, reason: "credentials_missing" })
    })
    it("is ready with an access token", () => {
      expect(xingyaProvider.getReadiness(mockAccount)).toEqual({ ready: true })
    })

    it("explains when the saved access token is missing", () => {
      expect(
        xingyaProvider.getReadiness({
          ...mockAccount,
          account_info: { ...mockAccount.account_info, access_token: "" },
        }),
      ).toEqual({ ready: false, reason: "credentials_missing" })
    })

    it("requires the account identity", () => {
      expect(
        xingyaProvider.getReadiness({
          ...mockAccount,
          account_info: { ...mockAccount.account_info, id: "" as never },
        }),
      ).toEqual({ ready: false, reason: "account_data_missing" })
    })

    it("requires configured login when cookie auth cannot provide dashboard bearer", () => {
      expect(
        xingyaProvider.getReadiness({
          ...mockAccount,
          authType: AuthTypeEnum.Cookie,
          account_info: { ...mockAccount.account_info, access_token: "" },
        }),
      ).toEqual({ ready: false, reason: "credentials_missing" })
    })
  })

  it("does not report success for an incomplete claim confirmation", async () => {
    const requests = await requestModule()
    vi.mocked(requests.envelope)
      .mockReset()
      .mockResolvedValueOnce({ success: true, message: "", data: undefined })
    await expect(
      xingyaProvider.checkIn(mockAccount, DEFAULT_PROVIDER_CONTEXT),
    ).resolves.toMatchObject({
      status: "uncertain",
      reasonCode: "checkin_unconfirmed",
    })
  })

  it("requires today's authoritative status before the claim mutation", () => {
    expect(xingyaProvider.requiresAuthoritativeStatusBeforeMutation).toBe(true)
  })

  describe("getStatus / detect", () => {
    it("does not accept a checked-in record from a rejected status envelope", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: false,
        message: "Session unavailable",
        data: liveStatusData,
      })
      await expect(
        xingyaProvider.getStatus!({ account: mockAccount, observedAt: 100 }),
      ).resolves.toBeUndefined()
    })

    it("discovers the login-session method without signing in or requiring a saved API token", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { xingya_checkin_available: true },
      })
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      await expect(
        xingyaProvider.detect!({ account, observedAt: 100 }),
      ).resolves.toMatchObject({ outcome: "matched" })
      expect(requests.envelope).toHaveBeenCalledWith(
        expect.objectContaining({ auth: { authType: AuthTypeEnum.None } }),
        expect.objectContaining({
          endpoint: "/api/status",
          options: { method: "GET" },
        }),
      )
      expect(login.loginAccount).not.toHaveBeenCalled()
    })
    it("reads today's state from the fork's read-only route", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: liveStatusData,
      })

      await expect(
        xingyaProvider.getStatus!({ account: mockAccount, observedAt: 100 }),
      ).resolves.toMatchObject({
        outcome: "known",
        availability: "enabled",
        today: "checked",
      })
      expect(vi.mocked(requests.envelope).mock.calls[0]?.[0]).toMatchObject({
        baseUrl: "https://xingya.site",
        accountId: "test-id",
      })
      expect(vi.mocked(requests.envelope).mock.calls[0]?.[1]).toMatchObject({
        endpoint: "/api/user/xingya-checkin",
        options: { method: "GET" },
      })
    })

    it("reports not-checked when the day is still open", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: {
          ...liveStatusData,
          today_record: {
            checked_in: false,
            quota_awarded: 0,
            source: "checkin",
          },
        },
      })

      await expect(
        xingyaProvider.getStatus!({ account: mockAccount, observedAt: 101 }),
      ).resolves.toMatchObject({
        availability: "enabled",
        today: "not_checked",
      })
    })

    it.each([
      ["the claim switch is off", { claim_enabled: false }],
      ["the check-in group is unavailable", { group_accessible: false }],
    ])("reports disabled when %s", async (_label, patch) => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { ...liveStatusData, ...patch },
      })

      await expect(
        xingyaProvider.getStatus!({ account: mockAccount, observedAt: 102 }),
      ).resolves.toMatchObject({ availability: "disabled" })
    })

    it("treats an unrelated payload as no status instead of a guess", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope)
        // The shared New API shape from a sibling deployment on the same path.
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { enabled: true, stats: { checked_in_today: true } },
        })
        .mockResolvedValueOnce({ success: true, message: "", data: undefined })

      await expect(
        xingyaProvider.getStatus!({ account: mockAccount, observedAt: 103 }),
      ).resolves.toBeUndefined()
      await expect(
        xingyaProvider.getStatus!({ account: mockAccount, observedAt: 104 }),
      ).resolves.toBeUndefined()
    })

    it("classifies a missing route as unsupported rather than unknown", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockRejectedValueOnce({ statusCode: 404 })

      await expect(
        xingyaProvider.detect!({ account: mockAccount, observedAt: 105 }),
      ).resolves.toMatchObject({ outcome: "unsupported" })
    })

    it("keeps an authentication failure unknown, never unsupported", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockRejectedValueOnce({ statusCode: 401 })

      await expect(
        xingyaProvider.detect!({ account: mockAccount, observedAt: 106 }),
      ).resolves.toMatchObject({ outcome: "unknown" })
    })
  })

  describe("checkIn", () => {
    it("posts the claim and reports the awarded quota", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { already_claimed: false, quota_awarded: 69350 },
      })

      const result = await xingyaProvider.checkIn(
        mockAccount,
        DEFAULT_PROVIDER_CONTEXT,
      )

      expect(result.status).toBe("success")
      expect(result.reward).toEqual({ quota: 69350 })
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.checkinSuccessful",
      )
      expect(vi.mocked(requests.envelope).mock.calls[0]?.[1]).toMatchObject({
        endpoint: "/api/user/xingya-daily-claim",
        options: { method: "POST" },
      })
    })

    it("maps already_claimed onto already_checked with the day's amount", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { already_claimed: true, quota_awarded: 69350 },
      })

      const result = await xingyaProvider.checkIn(
        mockAccount,
        DEFAULT_PROVIDER_CONTEXT,
      )

      expect(result.status).toBe("already_checked")
      expect(result.reward).toEqual({ quota: 69350 })
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.alreadyCheckedToday",
      )
    })

    it("leaves the reward unset when the site reports no usable amount", async () => {
      const requests = await requestModule()
      for (const quota_awarded of [undefined, 0, -1, Number.NaN]) {
        vi.mocked(requests.envelope).mockResolvedValueOnce({
          success: true,
          message: "",
          data: { already_claimed: false, quota_awarded },
        })

        const result = await xingyaProvider.checkIn(
          mockAccount,
          DEFAULT_PROVIDER_CONTEXT,
        )
        expect(result.status).toBe("success")
        expect(result.reward).toBeUndefined()
      }
    })

    it("treats the session-only claim refusal as a terminal sign-in requirement", async () => {
      const requests = await requestModule()
      // Verified live 2026-10-26: a scoped `nap_` access token reads the status
      // route but the claim route answers 403 AUTH_SESSION_REQUIRED.
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: false,
        message: "a dashboard login session is required",
        data: undefined,
      })

      const result = await xingyaProvider.checkIn(
        mockAccount,
        DEFAULT_PROVIDER_CONTEXT,
      )

      expect(result.status).toBe("failed")
      expect(result.reasonCode).toBe("authentication_required")
      expect(result.messageKey).toBe(
        "autoCheckin:skipReasons.authentication_required",
      )
      expect(result.rawMessage).toBe("a dashboard login session is required")
    })

    it.each(["a dashboard login session is required", "请登录控制台后领取"])(
      "keeps login guidance for an attributed HTTP 403 session requirement (%s)",
      async (message) => {
        const requests = await requestModule()
        vi.mocked(requests.envelope).mockRejectedValueOnce(
          new ApiError(
            message,
            403,
            "/api/user/xingya-daily-claim",
            API_ERROR_CODES.BUSINESS_ERROR,
            "AUTH_SESSION_REQUIRED",
          ),
        )
        await expect(
          xingyaProvider.checkIn(mockAccount, DEFAULT_PROVIDER_CONTEXT),
        ).resolves.toMatchObject({
          status: "failed",
          reasonCode: "authentication_required",
          messageKey: "autoCheckin:skipReasons.authentication_required",
          rawMessage: message,
        })
        expect(requests.envelope).toHaveBeenCalledTimes(1)
      },
    )

    it("does not interpret unattributed session text as a site login requirement", async () => {
      const requests = await requestModule()
      const error = new ApiError(
        "a dashboard login session is required",
        403,
        "/api/user/xingya-daily-claim",
        API_ERROR_CODES.BUSINESS_ERROR,
        "AUTH_SESSION_REQUIRED",
      )
      error.unattributedMessage = true
      vi.mocked(requests.envelope).mockRejectedValueOnce(error)
      await expect(
        xingyaProvider.checkIn(mockAccount, DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject({ reasonCode: "upstream_rejected" })
    })

    it("uses the session error code even when a successful HTTP envelope has translated copy", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: false,
        code: "AUTH_SESSION_REQUIRED",
        message: "请登录控制台后领取",
        data: null,
      } as never)
      await expect(
        xingyaProvider.checkIn(mockAccount, DEFAULT_PROVIDER_CONTEXT),
      ).resolves.toMatchObject({ reasonCode: "authentication_required" })
    })

    it("surfaces the site's own rejection copy as a retryable failure", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: false,
        message: "签到额度已用尽",
        data: undefined,
      })

      const result = await xingyaProvider.checkIn(
        mockAccount,
        DEFAULT_PROVIDER_CONTEXT,
      )

      expect(result.status).toBe("failed")
      expect(result.reasonCode).toBe("upstream_rejected")
      expect(result.rawMessage).toBe("签到额度已用尽")
    })

    it("never sends a GET for the mutation and never a POST for status", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope)
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: liveStatusData,
        })
        .mockResolvedValueOnce({
          success: true,
          message: "",
          data: { already_claimed: false, quota_awarded: 1 },
        })

      await xingyaProvider.getStatus!({ account: mockAccount, observedAt: 1 })
      await xingyaProvider.checkIn(mockAccount, DEFAULT_PROVIDER_CONTEXT)

      const calls = vi.mocked(requests.envelope).mock.calls
      expect(calls[0]?.[1]).toMatchObject({
        endpoint: "/api/user/xingya-checkin",
        options: { method: "GET" },
      })
      expect(calls[1]?.[1]).toMatchObject({
        endpoint: "/api/user/xingya-daily-claim",
        options: { method: "POST" },
      })
    })

    it("propagates the invoked request source", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { already_claimed: false, quota_awarded: 10 },
      })

      await xingyaProvider.checkIn(mockAccount, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      })

      expect(vi.mocked(requests.envelope).mock.calls[0]?.[0]).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
    })

    it("marks a lost response after dispatch as uncertain", async () => {
      const requests = await requestModule()
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      vi.mocked(requests.envelope).mockImplementationOnce(async (request) => {
        request.observer?.onDispatch()
        throw new TypeError("Failed to fetch")
      })

      await expect(
        xingyaProvider.checkIn(mockAccount, {
          ...DEFAULT_PROVIDER_CONTEXT,
          mutationLifecycle,
        }),
      ).resolves.toMatchObject({
        status: "uncertain",
        reasonCode: "network_error",
      })
    })

    it("reports an auth failure without claiming success", async () => {
      const requests = await requestModule()
      vi.mocked(requests.envelope).mockRejectedValueOnce({
        statusCode: 401,
        message: "Unauthorized, invalid access token",
      })

      const result = await xingyaProvider.checkIn(
        mockAccount,
        DEFAULT_PROVIDER_CONTEXT,
      )
      expect(result.status).not.toBe("success")
    })
  })
})
