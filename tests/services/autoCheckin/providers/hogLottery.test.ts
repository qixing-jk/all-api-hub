import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { loginAccount } from "~/services/accountLogin"
import {
  createNewApiAuthenticatedSessionRequest,
  NewApiSessionIdentityError,
} from "~/services/apiAdapters/newApi/account/authenticatedSession"
import {
  fetchHogLotteryConfigured,
  fetchHogLotteryPublicMarker,
  fetchHogLotteryStatus,
  performHogLotteryDraw,
} from "~/services/apiService/newApiFamily/variants/hogDailyLottery"
import {
  fetchHogAirdropClaims,
  fetchHogClaimableAirdrops,
  performHogAirdropClaim,
  type HogAirdropClaim,
} from "~/services/apiService/newApiFamily/variants/hogWelfareAirdrop"
import { ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { hogLotteryProvider } from "~/services/checkin/autoCheckin/providers/hogLottery"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/accountLogin", () => ({ loginAccount: vi.fn() }))
vi.mock(
  "~/services/apiAdapters/newApi/account/authenticatedSession",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiAdapters/newApi/account/authenticatedSession")
    >()),
    createNewApiAuthenticatedSessionRequest: vi.fn(),
  }),
)
vi.mock(
  "~/services/apiService/newApiFamily/variants/hogDailyLottery",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/newApiFamily/variants/hogDailyLottery")
    >()),
    fetchHogLotteryConfigured: vi.fn(),
    fetchHogLotteryPublicMarker: vi.fn(),
    fetchHogLotteryStatus: vi.fn(),
    performHogLotteryDraw: vi.fn(),
  }),
)
vi.mock(
  "~/services/apiService/newApiFamily/variants/hogWelfareAirdrop",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/newApiFamily/variants/hogWelfareAirdrop")
    >()),
    fetchHogAirdropClaims: vi.fn(),
    fetchHogClaimableAirdrops: vi.fn(),
    performHogAirdropClaim: vi.fn(),
  }),
)

const methodId = AUTO_CHECKIN_METHOD_IDS.HogDailyLottery
const account = () =>
  buildSiteAccount({
    site_url: "https://mirror.example",
    site_type: SITE_TYPES.NEW_API,
    login: {
      methodId: "password",
      credentials: { username: "fixture", password: "fixture-password" },
    },
    checkIn: {
      automaticExecutionEnabled: true,
      selection: { mode: "automatic", methodId },
      methodKnowledge: {
        methods: {
          [methodId]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 1 },
            },
          },
        },
      },
    },
  })
const context = () => ({
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
  mutationLifecycle: createAutoCheckinMutationLifecycle(),
})
const unchecked = {
  remaining: 1,
  daily_limit: 1,
  my_draw: null,
  rank: null,
} as const
const checked = () =>
  ({
    remaining: 0,
    daily_limit: 1,
    my_draw: {
      prizeName: "Prize",
      prizeLabel: "no assumed denomination",
      quotaAmount: 0,
      createdAt: new Date().toISOString(),
    },
    rank: 1,
  }) as const
const sessionRequest = {
  baseUrl: "https://mirror.example",
  directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "transient-dashboard-token",
    userId: "1",
  },
}
const campaign = { id: 8, quota: 500, endTime: 1795560000 }
const airClaim: HogAirdropClaim = {
  id: 70,
  airdropId: campaign.id,
  quota: campaign.quota,
  createdTime: 1795492800,
}

describe("Hog free daily draw integration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T03:00:00Z"))
    vi.mocked(fetchHogLotteryPublicMarker).mockResolvedValue(true)
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(unchecked)
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([])
    vi.mocked(fetchHogAirdropClaims).mockResolvedValue([])
    vi.mocked(performHogAirdropClaim).mockResolvedValue(airClaim)
    vi.mocked(fetchHogLotteryConfigured).mockResolvedValue(true)
    vi.mocked(performHogLotteryDraw).mockResolvedValue({
      prizeCode: "p",
      prizeName: "Prize",
      prizeLabel: "no assumed denomination",
      quotaAmount: 0,
    })
    vi.mocked(createNewApiAuthenticatedSessionRequest).mockResolvedValue(
      sessionRequest,
    )
    vi.mocked(loginAccount).mockImplementation(async (input) => {
      await input.onAuthenticated?.({} as never)
      return { status: "authenticated", identity: "1" } as never
    })
  })
  afterEach(() => vi.useRealTimers())

  it("requires configured account login instead of assuming a management PAT works", () => {
    const current = account()
    delete current.login
    expect(hogLotteryProvider.getReadiness(current)).toMatchObject({
      ready: false,
      reason: "credentials_missing",
    })
    expect(hogLotteryProvider.getReadiness(account())).toEqual({ ready: true })
  })
  it("discovers the exact public source marker anonymously without asserting status", async () => {
    expect(
      await hogLotteryProvider.detect?.({
        account: account(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({ outcome: "matched" })
    expect(fetchHogLotteryPublicMarker).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { authType: "none" },
        directRequestReason: "passive",
      }),
    )
    expect(fetchHogLotteryStatus).not.toHaveBeenCalled()
    expect(loginAccount).not.toHaveBeenCalled()
  })
  it("keeps a scoped PAT rejection unknown instead of reporting unsupported", async () => {
    vi.mocked(fetchHogLotteryPublicMarker).mockResolvedValue(false)
    vi.mocked(fetchHogLotteryStatus).mockRejectedValue(
      new ApiError("not declared", 403),
    )
    expect(
      await hogLotteryProvider.detect?.({
        account: account(),
        observedAt: Date.now(),
      }),
    ).toMatchObject({ outcome: "unknown" })
    expect(loginAccount).not.toHaveBeenCalled()
  })
  it("skips an already-drawn day inside the verified native session with no POST", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    expect(
      await executeSelectedCheckIn({
        account: account(),
        globalAutomaticExecutionEnabled: true,
        context: context(),
      }),
    ).toMatchObject({ kind: "executed", result: { status: "already_checked" } })
    expect(createNewApiAuthenticatedSessionRequest).toHaveBeenCalledOnce()
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("claims an eligible welfare airdrop even when today's lottery was already drawn", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])
    vi.mocked(fetchHogAirdropClaims)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([airClaim])

    const outcome = await hogLotteryProvider.checkIn(account(), context())

    expect(outcome).toMatchObject({
      status: "success",
      awards: [
        {
          amount: { status: "known", value: "500" },
          asset: { kind: "quota" },
          event: { namespace: "hog-welfare-airdrop", id: "70" },
        },
      ],
    })
    expect(performHogAirdropClaim).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ auth: sessionRequest.auth }),
      campaign.id,
      expect.objectContaining({ onDispatch: expect.any(Function) }),
    )
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("claims a welfare airdrop without drawing when the lottery is disabled", async () => {
    vi.mocked(fetchHogLotteryConfigured).mockResolvedValue(false)
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])
    vi.mocked(fetchHogAirdropClaims)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([airClaim])

    const outcome = await hogLotteryProvider.checkIn(account(), context())

    expect(outcome).toMatchObject({ status: "success" })
    expect(performHogAirdropClaim).toHaveBeenCalledOnce()
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("keeps the combined method unchecked while a welfare airdrop is claimable", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])

    await expect(
      hogLotteryProvider.getStatus?.({
        account: account(),
        observedAt: Date.now(),
      }),
    ).resolves.toMatchObject({
      outcome: "known",
      availability: "enabled",
      today: "not_checked",
    })
  })
  it("does not repost a campaign already present in the account claim history", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])
    vi.mocked(fetchHogAirdropClaims).mockResolvedValue([airClaim])

    await expect(
      hogLotteryProvider.checkIn(account(), context()),
    ).resolves.toMatchObject({
      status: "already_checked",
    })
    expect(performHogAirdropClaim).not.toHaveBeenCalled()
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it.each(["expired", "already claimed"])(
    "skips a later campaign that became %s during the previous claim",
    async (reason) => {
      const later = {
        ...campaign,
        id: 9,
        endTime: Math.floor(Date.now() / 1000) + 1,
      }
      const laterClaim = { ...airClaim, id: 71, airdropId: later.id }
      vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
      vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign, later])
      vi.mocked(fetchHogAirdropClaims)
        .mockResolvedValueOnce([])
        .mockImplementationOnce(async () => {
          if (reason === "expired") {
            vi.setSystemTime(Date.now() + 2_000)
            return [airClaim]
          }
          return [airClaim, laterClaim]
        })
      if (reason === "already claimed")
        vi.mocked(fetchHogAirdropClaims).mockResolvedValueOnce([
          airClaim,
          laterClaim,
        ])

      await expect(
        hogLotteryProvider.checkIn(account(), context()),
      ).resolves.toMatchObject({ status: "success" })
      expect(performHogAirdropClaim).toHaveBeenCalledExactlyOnceWith(
        expect.any(Object),
        campaign.id,
        expect.any(Object),
      )
    },
  )
  it("does not claim an airdrop that expires while awaiting mutation admission", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([
      { ...campaign, endTime: Math.floor(Date.now() / 1000) + 1 },
    ])

    await expect(
      hogLotteryProvider.checkIn(account(), {
        ...context(),
        async beforeRecoveredMutation() {
          vi.setSystemTime(Date.now() + 2_000)
          return true
        },
      }),
    ).resolves.toMatchObject({ status: "already_checked" })
    expect(performHogAirdropClaim).not.toHaveBeenCalled()
  })
  it("rechecks own claims after mutation admission and before the claim POST", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])

    await expect(
      hogLotteryProvider.checkIn(account(), {
        ...context(),
        async beforeRecoveredMutation() {
          vi.mocked(fetchHogAirdropClaims).mockResolvedValue([airClaim])
          return true
        },
      }),
    ).resolves.toMatchObject({ status: "already_checked" })
    expect(performHogAirdropClaim).not.toHaveBeenCalled()
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("confirms a lost airdrop response from a new own-claim row without replaying it", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])
    vi.mocked(fetchHogAirdropClaims)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([airClaim])
    vi.mocked(performHogAirdropClaim).mockImplementationOnce(
      async (_request, _id, observer) => {
        observer?.onDispatch()
        throw new TypeError("lost response")
      },
    )

    const outcome = await hogLotteryProvider.checkIn(account(), context())

    expect(outcome).toMatchObject({
      status: "success",
      awards: [
        {
          amount: { status: "known", value: "500" },
        },
      ],
    })
    expect(performHogAirdropClaim).toHaveBeenCalledOnce()
    expect(fetchHogAirdropClaims).toHaveBeenCalledTimes(2)
  })
  it("leaves an unverified airdrop claim uncertain and never posts it twice", async () => {
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(checked())
    vi.mocked(fetchHogClaimableAirdrops).mockResolvedValue([campaign])
    vi.mocked(fetchHogAirdropClaims)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("history unavailable"))
    vi.mocked(performHogAirdropClaim).mockRejectedValueOnce(
      new TypeError("lost response"),
    )
    const invocation = context()
    invocation.mutationLifecycle.onDispatch()

    await expect(
      hogLotteryProvider.checkIn(account(), invocation),
    ).resolves.toMatchObject({
      status: "uncertain",
      reasonCode: "checkin_unconfirmed",
    })
    expect(performHogAirdropClaim).toHaveBeenCalledOnce()
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("requires a configured active prize list before the free draw", async () => {
    vi.mocked(fetchHogLotteryConfigured).mockResolvedValue(false)
    expect(
      await hogLotteryProvider.checkIn(account(), context()),
    ).toMatchObject({ status: "failed", reasonCode: "method_disabled" })
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it.each([0, 123])(
    "confirms explicit raw quota %s by the current record without USD conversion",
    async (quotaAmount) => {
      vi.mocked(performHogLotteryDraw).mockResolvedValue({
        prizeCode: "p",
        prizeName: "Prize",
        prizeLabel: "no assumed denomination",
        quotaAmount,
      })
      vi.mocked(fetchHogLotteryStatus)
        .mockResolvedValueOnce(unchecked)
        .mockResolvedValueOnce({
          ...checked(),
          my_draw: { ...checked().my_draw, quotaAmount },
        })
      expect(
        await hogLotteryProvider.checkIn(account(), context()),
      ).toMatchObject({
        status: "success",
        awards: [
          {
            amount: { status: "known", value: String(quotaAmount) },
            asset: {
              kind: "quota",
              id: "https://mirror.example:new-api-quota",
            },
          },
        ],
      })
      expect(performHogLotteryDraw).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ auth: sessionRequest.auth }),
      )
    },
  )
  it("reconciles a lost response with one GET and never retries the draw", async () => {
    vi.mocked(performHogLotteryDraw).mockImplementationOnce(async (request) => {
      request.observer?.onDispatch()
      throw new TypeError("lost")
    })
    vi.mocked(fetchHogLotteryStatus)
      .mockResolvedValueOnce(unchecked)
      .mockResolvedValueOnce(checked())
    const invocation = context()
    expect(
      await hogLotteryProvider.checkIn(account(), invocation),
    ).toMatchObject({ status: "success" })
    expect(fetchHogLotteryStatus).toHaveBeenCalledTimes(2)
    expect(performHogLotteryDraw).toHaveBeenCalledOnce()
  })
  it("accepts matched success and today's record when the server clock is slightly behind", async () => {
    vi.mocked(fetchHogLotteryStatus)
      .mockResolvedValueOnce(unchecked)
      .mockResolvedValueOnce({
        ...checked(),
        my_draw: {
          ...checked().my_draw,
          createdAt: new Date(Date.now() - 2000).toISOString(),
        },
      })
    expect(
      await hogLotteryProvider.checkIn(account(), context()),
    ).toMatchObject({ status: "success" })
    expect(performHogLotteryDraw).toHaveBeenCalledOnce()
  })
  it("does not claim a concurrent record after a definite rejection", async () => {
    vi.mocked(performHogLotteryDraw).mockRejectedValue(
      new ApiError("forbidden", 403),
    )
    vi.mocked(fetchHogLotteryStatus)
      .mockResolvedValueOnce(unchecked)
      .mockResolvedValueOnce(checked())
    const invocation = context()
    invocation.mutationLifecycle.onDispatch()
    const result = await hogLotteryProvider.checkIn(account(), invocation)
    expect(result.status).toBe("failed")
    expect(result.awards).toBeUndefined()
  })
  it("leaves missing or conflicting readback unconfirmed", async () => {
    vi.mocked(fetchHogLotteryStatus)
      .mockResolvedValueOnce(unchecked)
      .mockRejectedValueOnce(new Error("offline"))
    expect(
      await hogLotteryProvider.checkIn(account(), context()),
    ).toMatchObject({ status: "uncertain" })
    expect(performHogLotteryDraw).toHaveBeenCalledOnce()
  })
  it("requires duplicate readback and does not invent a new reward", async () => {
    const error = new ApiError(
      "already",
      409,
      undefined,
      undefined,
      "LOTTERY_DAILY_LIMIT_REACHED",
    )
    vi.mocked(performHogLotteryDraw).mockRejectedValue(error)
    vi.mocked(fetchHogLotteryStatus)
      .mockResolvedValueOnce(unchecked)
      .mockResolvedValueOnce(checked())
    const result = await hogLotteryProvider.checkIn(account(), context())
    expect(result).toMatchObject({ status: "already_checked" })
    expect(result.awards).toBeUndefined()
    expect(performHogLotteryDraw).toHaveBeenCalledOnce()
  })
  it("rechecks intent after session authentication", async () => {
    expect(
      await hogLotteryProvider.checkIn(account(), {
        ...context(),
        beforeRecoveredMutation: async () => false,
      }),
    ).toMatchObject({ reasonCode: "account_unavailable" })
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("does not draw with an unverified account identity", async () => {
    vi.mocked(createNewApiAuthenticatedSessionRequest).mockRejectedValue(
      new NewApiSessionIdentityError("mismatch"),
    )
    expect(
      await hogLotteryProvider.checkIn(account(), context()),
    ).toMatchObject({ status: "failed" })
    expect(fetchHogLotteryStatus).not.toHaveBeenCalled()
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
  it("does not claim after a status read crosses Shanghai midnight", async () => {
    vi.setSystemTime(new Date("2026-11-24T15:59:59Z"))
    vi.mocked(fetchHogLotteryStatus).mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-11-24T16:00:01Z"))
      return unchecked
    })
    expect(
      await hogLotteryProvider.checkIn(account(), context()),
    ).toMatchObject({ status: "failed" })
    expect(performHogLotteryDraw).not.toHaveBeenCalled()
  })
})
