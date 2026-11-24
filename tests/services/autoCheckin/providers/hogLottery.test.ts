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

describe("Hog free daily draw integration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T03:00:00Z"))
    vi.mocked(fetchHogLotteryPublicMarker).mockResolvedValue(true)
    vi.mocked(fetchHogLotteryStatus).mockResolvedValue(unchecked)
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
    vi.mocked(performHogLotteryDraw).mockRejectedValue(new TypeError("lost"))
    vi.mocked(fetchHogLotteryStatus)
      .mockResolvedValueOnce(unchecked)
      .mockResolvedValueOnce(checked())
    const invocation = context()
    invocation.mutationLifecycle.onDispatch()
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
