import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const methodId = AUTO_CHECKIN_METHOD_IDS.SidruneDailyCheckIn
const request = {
  baseUrl: "https://global.sidrune.ai",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "test-token",
    userId: "42",
  },
}
const envelope = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})
const account = () =>
  buildSiteAccount({
    site_url: request.baseUrl,
    site_type: SITE_TYPES.SUB2API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "42",
      username: "Example",
      access_token: "test-token",
      quota: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    checkIn: {
      automaticExecutionEnabled: true,
      selection: { mode: "automatic", methodId },
      methodKnowledge: {
        methods: {
          [methodId]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
          },
        },
      },
    },
  })
const execute = () =>
  executeSelectedCheckIn({
    account: account(),
    globalAutomaticExecutionEnabled: true,
    context: {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      ),
    },
  })

describe("Sidrune welfare check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("discovers the native welfare method and reads today's checked state without submitting", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      envelope({
        enabled: true,
        eligible: true,
        checked_in_today: true,
        balance: 0.04,
        cycle_days: 30,
      }),
    )
    const entry = autoCheckinMethodRegistry
      .getCandidates(SITE_TYPES.SUB2API, request.baseUrl)
      .find((entry) => entry.id === methodId)
    expect(entry, "Sidrune must be an eligible Sub2API method").toBeDefined()
    const result = await entry!.provider.detect!({ request, observedAt: 123 })
    expect(result).toMatchObject({
      detection: { outcome: "matched" },
      status: {
        outcome: "known",
        availability: "enabled",
        today: "checked",
      },
    })
    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        endpoint: "/api/v1/welfare/profile",
        options: { method: "GET", cache: "no-store" },
      }),
    )
  })

  it("submits one native check-in after an eligible status and retains welfare credit separately", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(
      async (_request, options) => {
        if (options.options?.method === "POST")
          return envelope({
            streak_day: 7,
            reward_amount: 0.04,
            milestone_bonus: 0.1,
          })
        return envelope({
          enabled: true,
          eligible: true,
          checked_in_today: false,
        })
      },
    )
    const result = await execute()
    expect(result).toMatchObject({
      kind: "executed",
      result: {
        status: "success",
        data: { rewardAmount: 0.04, milestoneBonus: 0.1, streakDay: 7 },
      },
    })
    if (result.kind === "executed") expect(result.result.reward).toBeUndefined()
    const posts = vi
      .mocked(fetchApiResponse)
      .mock.calls.filter(([, options]) => options.options?.method === "POST")
    expect(posts).toHaveLength(1)
    expect(posts[0]![1]).toMatchObject({
      endpoint: "/api/v1/welfare/checkin",
      options: { method: "POST" },
    })
    expect(posts[0]![1].options?.body).toBeUndefined()
  })

  it.each([
    { enabled: false, eligible: true, checked_in_today: false },
    { enabled: true, eligible: false, checked_in_today: false },
    { enabled: true, eligible: true, checked_in_today: true },
  ])(
    "does not submit when today's profile forbids the action: %j",
    async (profile) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(envelope(profile))
      const result = await execute()
      expect(result.kind).toBe("skipped")
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.every(([, options]) => options.options?.method === "GET"),
      ).toBe(true)
    },
  )

  it.each([
    null,
    {},
    { enabled: true, checked_in_today: false },
    { enabled: true, eligible: "true", checked_in_today: false },
    { enabled: true, eligible: true, checked_in_today: 0 },
  ])(
    "keeps malformed status inconclusive and never submits: %j",
    async (profile) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(envelope(profile))
      const entry = autoCheckinMethodRegistry.resolveById(methodId)!
      expect(
        await entry.provider.detect!({ request, observedAt: 123 }),
      ).toMatchObject({ outcome: "unknown" })
      await execute()
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.every(([, options]) => options.options?.method === "GET"),
      ).toBe(true)
    },
  )

  it.each([
    [401, "unknown"],
    [403, "unknown"],
    [404, "unsupported"],
    [405, "unsupported"],
  ] as const)(
    "classifies HTTP %i without recovering or submitting",
    async (status, outcome) => {
      vi.mocked(fetchApiResponse).mockResolvedValue({
        ok: false,
        status,
        headers: {},
        body: { code: "UNAUTHORIZED", message: "request rejected" },
      })
      const entry = autoCheckinMethodRegistry.resolveById(methodId)!
      const fetch = vi.spyOn(globalThis, "fetch")
      try {
        const expired = {
          ...request,
          auth: {
            ...request.auth,
            refreshToken: "do-not-rotate",
            tokenExpiresAt: Date.now() - 1000,
          },
        }
        expect(
          await entry.provider.detect!({ request: expired, observedAt: 123 }),
        ).toMatchObject({ outcome })
        expect(fetchApiResponse).toHaveBeenCalledOnce()
        expect(fetch).not.toHaveBeenCalled()
      } finally {
        fetch.mockRestore()
      }
    },
  )

  it("leaves missing credentials unknown without any transport request", async () => {
    const entry = autoCheckinMethodRegistry.resolveById(methodId)!
    const missing = { ...request, auth: { ...request.auth, accessToken: "" } }
    expect(
      await entry.provider.detect!({ request: missing, observedAt: 123 }),
    ).toMatchObject({ outcome: "unknown" })
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "reconciles a lost response with status without replay (checked=%s)",
    async (checked) => {
      let submitted = false
      vi.mocked(fetchApiResponse).mockImplementation(
        async (request, options) => {
          if (options.options?.method === "POST") {
            submitted = true
            request.observer?.onDispatch()
            throw new TypeError("Failed to fetch")
          }
          return envelope({
            enabled: true,
            eligible: true,
            checked_in_today: submitted && checked,
          })
        },
      )
      const result = await execute()
      expect(result).toMatchObject({
        kind: "executed",
        retryable: false,
        result: { status: checked ? "success" : "failed" },
      })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(
            ([, options]) => options.options?.method === "POST",
          ),
      ).toHaveLength(1)
      if (result.kind === "executed")
        expect(result.result.reward).toBeUndefined()
    },
  )

  it.each([
    {},
    { reward_amount: -1, milestone_bonus: 0, streak_day: 1 },
    { reward_amount: 0.04, milestone_bonus: null, streak_day: 1 },
    { reward_amount: Infinity, milestone_bonus: 0, streak_day: 1 },
    { reward_amount: 0.04, milestone_bonus: 0, streak_day: 0 },
  ])(
    "does not report a grant from an invalid mutation response: %j",
    async (mutation) => {
      vi.mocked(fetchApiResponse).mockImplementation(
        async (request, options) => {
          if (options.options?.method === "POST") {
            request.observer?.onDispatch()
            return envelope(mutation)
          }
          return envelope({
            enabled: true,
            eligible: true,
            checked_in_today: false,
          })
        },
      )
      expect(await execute()).toMatchObject({
        kind: "executed",
        retryable: false,
        result: { status: "failed" },
      })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(
            ([, options]) => options.options?.method === "POST",
          ),
      ).toHaveLength(1)
    },
  )
})
