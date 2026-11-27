import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import { loxoProvider } from "~/services/checkin/autoCheckin/providers/loxo"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/sub2api/auth/authLifecycle", () => ({
  executeAuthenticatedSub2ApiRequest: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", async (original) => ({
  ...(await original<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const endpoint = "/api/v1/user/check-in"
const account = buildSiteAccount({
  site_url: "https://loxo.cc",
  site_type: SITE_TYPES.SUB2API,
  authType: AuthTypeEnum.AccessToken,
})
account.account_info.id = "42"
account.account_info.access_token = "test-access-token"
account.checkIn = {
  automaticExecutionEnabled: true,
  selection: {
    mode: "automatic",
    methodId: AUTO_CHECKIN_METHOD_IDS.LoxoDailyCheckIn,
  },
  methodKnowledge: {
    methods: {
      [AUTO_CHECKIN_METHOD_IDS.LoxoDailyCheckIn]: {
        detection: {
          outcome: "matched",
          evidence: { source: "probe", observedAt: 123 },
        },
      },
    },
  },
}
const status = {
  enabled: true,
  checked_in_today: false,
  captcha_required: false,
}
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
  statusProof: {
    outcome: "known",
    availability: "enabled",
    today: "not_checked",
    requiresManualVerification: false,
    evidence: { source: "probe", observedAt: 123 },
  },
} as const
const respond = (data: unknown, reason?: string) =>
  vi
    .mocked(fetchApiResponse)
    .mockImplementationOnce(async (request, options) => {
      if (options.options?.method === "POST") {
        request.observer?.onDispatch()
        request.observer?.onResponse()
      }
      return {
        ok: !reason,
        status: reason ? 400 : 200,
        headers: {},
        body: { code: reason ? 400 : 0, message: reason ?? "OK", reason, data },
      }
    })

describe("Loxo check-in", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(executeAuthenticatedSub2ApiRequest).mockImplementation(
      (request, _path, execute) => execute(request),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it("uses the native browser timezone for both status and feedback GETs", async () => {
    const options = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...options,
      timeZone: "Asia/Kathmandu",
    })
    respond(status)
    await loxoProvider.getStatus?.({ account, observedAt: 123 })
    const path = "/api/v1/user/check-in?timezone=Asia%2FKathmandu"
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: path,
      options: { method: "GET", cache: "no-store" },
    })
    const routes = getCheckInFeedbackStatusRoutes(
      SITE_TYPES.SUB2API,
      account.site_url,
    )
    expect(routes).toContainEqual({ path })
    expect(routes).not.toContainEqual({ path: endpoint })
  })

  it("discovers through a passive GET and carries forward the site's verification gate", async () => {
    respond({ ...status, captcha_required: true })
    await expect(
      loxoProvider.detect?.({ account, observedAt: 123 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: {
        availability: "enabled",
        today: "not_checked",
        requiresManualVerification: true,
      },
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: `${endpoint}?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
      options: { method: "GET", cache: "no-store" },
    })
    expect(executeAuthenticatedSub2ApiRequest).toHaveBeenCalledWith(
      expect.anything(),
      endpoint,
      expect.any(Function),
      {
        proactiveRefresh: false,
        recoverMissingAccessToken: false,
        recoverUnauthorized: false,
      },
    )
  })

  it("allows authentication renewal only for the admitted execution status read", async () => {
    respond(status)
    respond({ reward: 0.12, streak_days: 3 })
    await expect(
      executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context,
      }),
    ).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    const [admissionRequest, admissionEndpoint, , admissionOptions] =
      vi.mocked(executeAuthenticatedSub2ApiRequest).mock.calls[0]!
    expect(admissionEndpoint).toBe(endpoint)
    expect(admissionOptions).toMatchObject({
      singleRecovery: true,
      prepareRecoveryRequest: expect.any(Function),
    })
    const prepareRecoveryRequest = admissionOptions?.prepareRecoveryRequest
    if (!prepareRecoveryRequest)
      throw new Error("Expected the admitted status read to prepare recovery")
    const recoveryRequest = prepareRecoveryRequest(admissionRequest)
    expect(recoveryRequest).toMatchObject({
      tempWindowRequestSource: context.tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
      directRequestReason: undefined,
    })

    const [mutationRequest, , , mutationOptions] =
      vi.mocked(executeAuthenticatedSub2ApiRequest).mock.calls[1]!
    expect(mutationRequest).toMatchObject({
      tempWindowRequestSource: context.tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
      directRequestReason: undefined,
    })
    expect(mutationOptions).toEqual({
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    })
  })

  it("keeps discovery and ordinary refresh passive even with execution context", async () => {
    respond(status)
    await loxoProvider.detect?.({
      account,
      observedAt: 123,
      authenticationRecovery: context,
    })
    respond(status)
    await loxoProvider.getStatus?.({ account, observedAt: 123 })
    for (const call of vi.mocked(executeAuthenticatedSub2ApiRequest).mock
      .calls) {
      expect(call[3]).toEqual({
        proactiveRefresh: false,
        recoverMissingAccessToken: false,
        recoverUnauthorized: false,
      })
    }
  })

  it.each([
    [
      { ...status, checked_in_today: true },
      { availability: "enabled", today: "checked" },
    ],
    [
      { ...status, enabled: false },
      { availability: "disabled", today: "not_checked" },
    ],
    [{ enabled: true, checked_in_today: false }, { outcome: "unknown" }],
  ])(
    "distinguishes checked, disabled and incomplete replies",
    async (data, expected) => {
      respond(data)
      const result = await loxoProvider.detect?.({ account, observedAt: 123 })
      expect(
        result && "detection" in result ? result.status : result,
      ).toMatchObject(expected)
    },
  )

  it("only submits the native empty body once with explicit, unchallenged status", async () => {
    respond({ reward: 0.12, streak_days: 3 })
    await expect(loxoProvider.checkIn(account, context)).resolves.toMatchObject(
      { status: "success", data: { reward: 0.12 } },
    )
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { endpoint, options: { method: "POST", cache: "no-store", body: "{}" } },
    )
  })

  it("leaves the native verification to the user", async () => {
    await expect(
      loxoProvider.checkIn(account, {
        ...context,
        statusProof: {
          ...context.statusProof,
          requiresManualVerification: true,
        },
      }),
    ).resolves.toMatchObject({
      reasonCode: "manual_verification_required",
      messageParams: { checkInUrl: "https://loxo.cc/check-in" },
    })
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })

  it.each([
    ["CHECK_IN_ALREADY_DONE", { status: "already_checked" }],
    ["CHECK_IN_DISABLED", { reasonCode: "method_disabled" }],
    [
      "CHECK_IN_CAPTCHA_REQUIRED",
      { reasonCode: "manual_verification_required" },
    ],
  ])("recognizes the native reason %s", async (reason, expected) => {
    respond(null, reason as string)
    await expect(loxoProvider.checkIn(account, context)).resolves.toMatchObject(
      expected,
    )
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("leaves ambiguous dispatched claims for readback without replay", async () => {
    respond({})
    await expect(
      loxoProvider.checkIn(account, {
        ...context,
        mutationLifecycle: {
          dispatched: true,
          responseReceived: true,
          onDispatch: () => {},
          onResponse: () => {},
        },
      }),
    ).resolves.toMatchObject({ status: "uncertain" })
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it.each([
    undefined,
    { ...context.statusProof, requiresManualVerification: undefined },
    { ...context.statusProof, today: "checked" as const },
  ])(
    "does not mutate without an eligible status proof",
    async (statusProof) => {
      await loxoProvider.checkIn(account, { ...context, statusProof })
      expect(fetchApiResponse).not.toHaveBeenCalled()
    },
  )

  it("honors a cancellation after status admission", async () => {
    await expect(
      loxoProvider.checkIn(account, {
        ...context,
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toMatchObject({ reasonCode: "account_unavailable" })
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })

  it("reconciles an ambiguous claim with today's GET instead of replaying POST", async () => {
    respond(status)
    respond({})
    respond({ ...status, checked_in_today: true })
    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: {
        ...context,
        statusProof: undefined,
        mutationLifecycle: {
          dispatched: true,
          responseReceived: true,
          onDispatch: () => {},
          onResponse: () => {},
        },
      },
    })
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map((call) => call[1].options?.method),
    ).toEqual(["GET", "POST", "GET"])
    expect(executeAuthenticatedSub2ApiRequest).toHaveBeenLastCalledWith(
      expect.anything(),
      endpoint,
      expect.any(Function),
      {
        proactiveRefresh: false,
        recoverMissingAccessToken: false,
        recoverUnauthorized: false,
      },
    )
  })

  it("reports failure after readback confirms an inconclusive claim did not check in", async () => {
    respond(status)
    respond({})
    respond(status)
    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: {
        ...context,
        statusProof: undefined,
        mutationLifecycle: {
          dispatched: true,
          responseReceived: true,
          onDispatch: () => {},
          onResponse: () => {},
        },
      },
    })
    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "failed" },
    })
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map((call) => call[1].options?.method),
    ).toEqual(["GET", "POST", "GET"])
  })
})
