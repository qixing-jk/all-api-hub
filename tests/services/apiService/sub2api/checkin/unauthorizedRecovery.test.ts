import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { performAiRouterDailyCheckIn } from "~/services/apiService/sub2api/checkin/aiRouterCheckIn"
import { performBaiApiCheckIn } from "~/services/apiService/sub2api/checkin/baiApiCheckIn"
import { performClawhudDailyCheckIn } from "~/services/apiService/sub2api/checkin/clawhudCheckIn"
import { performDaiguaDailyCheckIn } from "~/services/apiService/sub2api/checkin/daiguaCheckIn"
import { performFreeApiDailyCheckIn } from "~/services/apiService/sub2api/checkin/freeApiCheckIn"
import { performGeniusProgrammerDailyCheckIn } from "~/services/apiService/sub2api/checkin/geniusProgrammerCheckIn"
import { performHiyoDailyCheckIn } from "~/services/apiService/sub2api/checkin/hiyoCheckIn"
import { performSidruneDailyCheckIn } from "~/services/apiService/sub2api/checkin/sidruneCheckIn"
import { performToolcodeDailyCheckIn } from "~/services/apiService/sub2api/checkin/toolcodeCheckIn"
import { SUB2API_CHECK_IN_RECOVERY_REASONS } from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { performXiaobaiCodeDailyCheckIn } from "~/services/apiService/sub2api/checkin/xiaobaiCodeCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { aiRouterProvider } from "~/services/checkin/autoCheckin/providers/aiRouter"
import { baiApiProvider } from "~/services/checkin/autoCheckin/providers/baiApi"
import { clawhudProvider } from "~/services/checkin/autoCheckin/providers/clawhud"
import { daiguaProvider } from "~/services/checkin/autoCheckin/providers/daigua"
import { freeApiProvider } from "~/services/checkin/autoCheckin/providers/freeApi"
import { geniusProgrammerProvider } from "~/services/checkin/autoCheckin/providers/geniusProgrammer"
import { hiyoProvider } from "~/services/checkin/autoCheckin/providers/hiyo"
import { sidruneProvider } from "~/services/checkin/autoCheckin/providers/sidrune"
import { toolcodeProvider } from "~/services/checkin/autoCheckin/providers/toolcode"
import { xiaobaiCodeProvider } from "~/services/checkin/autoCheckin/providers/xiaobaiCode"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn(),
  }),
)
vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createAccountApiRequestFromStoredAccount: () => ({ request }),
}))

const request: ApiServiceRequest = {
  baseUrl: "https://relay.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "expired",
    userId: "42",
  },
}
const response = (
  data: unknown,
  status = 200,
): ApiTransportResponse<unknown> => ({
  ok: status === 200,
  status,
  headers: {},
  body: { code: 0, message: "success", data },
})
const cases = [
  {
    name: "AI-ROUTER",
    perform: performAiRouterDailyCheckIn,
    provider: aiRouterProvider,
    status: (checked: boolean) => ({
      enabled: true,
      checked_today: checked,
      reward_amount: 0.1,
    }),
    award: { checked_today: true, reward_amount: 0.1 },
    text: true,
  },
  {
    name: "小白Code",
    perform: performXiaobaiCodeDailyCheckIn,
    provider: xiaobaiCodeProvider,
    status: (checked: boolean) => ({
      config: { enabled: true },
      signedToday: checked,
    }),
    award: { alreadyChecked: false, record: { reward_amount: 0.1 } },
    text: true,
    xiaobai: true,
  },
  {
    name: "toolcode",
    perform: performToolcodeDailyCheckIn,
    provider: toolcodeProvider,
    status: (checked: boolean) => ({
      checkin_enabled: true,
      checked_in_today: checked,
      can_checkin: !checked,
    }),
    award: { checked_in_today: true, points_reward: 1, reward_amount: 0.1 },
  },
  {
    name: "sidrune",
    perform: performSidruneDailyCheckIn,
    provider: sidruneProvider,
    status: (checked: boolean) => ({
      enabled: true,
      eligible: true,
      checked_in_today: checked,
    }),
    award: { reward_amount: 0.1, milestone_bonus: 0, streak_day: 1 },
  },
  {
    name: "hiyo",
    perform: performHiyoDailyCheckIn,
    provider: hiyoProvider,
    status: (checked: boolean) => ({
      enabled: true,
      daily_claimed: checked,
      daily_available: true,
      can_claim: true,
      tokens_met: true,
    }),
    award: {
      type: "daily",
      amount: 0.1,
      status: {
        enabled: true,
        daily_claimed: true,
        daily_available: true,
        can_claim: true,
        tokens_met: true,
      },
    },
  },
  {
    name: "daigua",
    perform: performDaiguaDailyCheckIn,
    provider: daiguaProvider,
    status: (checked: boolean) => ({
      enabled: true,
      can_checkin: !checked,
      luck_enabled: false,
    }),
    award: { checkin_type: "normal", reward_amount: 0.1 },
  },
  {
    name: "geniusProgrammer",
    perform: performGeniusProgrammerDailyCheckIn,
    provider: geniusProgrammerProvider,
    status: (checked: boolean) => ({
      enabled: true,
      today_checked_in: checked,
    }),
    award: { new_reward: true, reward_amount: 0.1 },
  },
  {
    name: "clawhud",
    perform: performClawhudDailyCheckIn,
    provider: clawhudProvider,
    status: (checked: boolean) => ({
      enabled: true,
      checked_in_today: checked,
    }),
    award: { checked_in_today: true, today_amount: 0.1 },
  },
  {
    name: "柏 API",
    perform: performBaiApiCheckIn,
    provider: baiApiProvider,
    status: (checked: boolean) => ({
      checked_today: checked,
      checkin_date: "2026-11-03",
    }),
    award: { checkin_date: "2026-11-03", cash_amount_usd: 0.1 },
  },
  {
    name: "FreeAPI",
    perform: performFreeApiDailyCheckIn,
    provider: freeApiProvider,
    status: (checked: boolean) => ({
      enabled: true,
      checked_in_today: checked,
      reward_today: 0.1,
    }),
    award: { amount: 0.1 },
  },
]

describe.each(cases)(
  "$name unauthorized check-in recovery",
  ({ perform, provider, status, award, ...format }) => {
    const reply = (data: unknown, status = 200) => {
      const result = response(data, status)
      if ("text" in format)
        result.body = JSON.stringify(
          "xiaobai" in format ? { ok: true, data } : result.body,
        )
      return result
    }
    beforeEach(() => {
      vi.mocked(fetchApiResponse).mockReset()
      vi.mocked(recoverSub2ApiBrowserAuth).mockReset().mockResolvedValue({
        accessToken: "recovered",
        userId: "42",
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      })
    })

    it("rechecks with recovered credentials and stops when today is already checked", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply(status(true)))
      await expect(perform(request)).rejects.toMatchObject({
        reason: SUB2API_CHECK_IN_RECOVERY_REASONS.AlreadyChecked,
      })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.map(([, options]) => options.options?.method),
      ).toEqual(["POST", "GET"])
      expect(
        vi.mocked(fetchApiResponse).mock.calls[1]?.[0].auth?.accessToken,
      ).toBe("recovered")
    })

    it("retries one POST only after a recovered GET confirms daily eligibility", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply(status(false)))
        .mockResolvedValueOnce(reply(award))
      await expect(perform(request)).resolves.toBeDefined()
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.map(([, options]) => options.options?.method),
      ).toEqual(["POST", "GET", "POST"])
      expect(
        vi.mocked(fetchApiResponse).mock.calls[2]?.[0].auth?.accessToken,
      ).toBe("recovered")
    })

    it("blocks replay when recovered status cannot be read", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockRejectedValueOnce(new Error("offline"))
      await expect(perform(request)).rejects.toMatchObject({
        reason: SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable,
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    })

    it("blocks replay when recovered status is malformed", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply({}))
      await expect(perform(request)).rejects.toMatchObject({
        reason: SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable,
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    })

    it("does not recover a second unauthorized mutation", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply(status(false)))
        .mockResolvedValueOnce(reply(null, 401))
      await expect(perform(request)).rejects.toMatchObject({ statusCode: 401 })
      expect(fetchApiResponse).toHaveBeenCalledTimes(3)
      expect(recoverSub2ApiBrowserAuth).toHaveBeenCalledOnce()
    })

    it("rechecks current account intent before a recovered POST", async () => {
      const beforeRecoveredMutation = vi.fn().mockResolvedValue(false)
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply(status(false)))
      await expect(
        perform(request, { beforeRecoveredMutation }),
      ).rejects.toMatchObject({
        reason: SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed,
      })
      expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    })

    it("does not replay a lost mutation response or recover authentication", async () => {
      const lost = new Error("response lost")
      vi.mocked(fetchApiResponse).mockRejectedValueOnce(lost)
      await expect(perform(request)).rejects.toBe(lost)
      expect(fetchApiResponse).toHaveBeenCalledOnce()
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    })
    const account = buildSiteAccount({
      site_url: request.baseUrl,
      site_type: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "42",
        access_token: "expired",
      },
    })
    const context = () => ({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      ),
      statusProof: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: Date.now(),
        },
      },
    })
    it("reports already checked without an invented reward after recovery", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply(status(true)))
      const result = await provider.checkIn(account, context())
      expect(result).toMatchObject({ status: "already_checked" })
      expect(result.reward).toBeUndefined()
    })
    it("stops recovered submission when current account intent changed", async () => {
      const beforeRecoveredMutation = vi.fn().mockResolvedValue(false)
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockResolvedValueOnce(reply(status(false)))
      await expect(
        provider.checkIn(account, { ...context(), beforeRecoveredMutation }),
      ).resolves.toMatchObject({
        status: "failed",
        reasonCode: "account_unavailable",
      })
      expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    })

    it("reports an unreadable recovered status without mutation uncertainty", async () => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(reply(null, 401))
        .mockRejectedValueOnce(new Error("status offline"))
      await expect(provider.checkIn(account, context())).resolves.toMatchObject(
        { status: "failed", reasonCode: "status_unavailable" },
      )
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    })
  },
)
