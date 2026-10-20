import i18n from "i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import autoCheckin from "~/locales/en/autoCheckin.json"
import {
  claimRelayForCheckIn,
  fetchRelayForCheckInCampaigns,
} from "~/services/apiService/relayfor"
import { relayForProvider } from "~/services/checkin/autoCheckin/providers/relayfor"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/relayfor", () => ({
  fetchRelayForCheckInCampaigns: vi.fn(),
  claimRelayForCheckIn: vi.fn(),
}))

const defaultAccountInfo = {
  id: "1",
  username: "relayuser",
  access_token: "test-token",
  quota: 500000,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_quota_consumption: 0,
  today_requests_count: 0,
  today_income: 0,
}

const mockAccount = buildSiteAccount({
  site_type: SITE_TYPES.RELAYFOR,
  site_url: "https://relayfor.xyz",
  account_info: defaultAccountInfo,
})

describe("relayForProvider", () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 19, 12))
    i18n.addResourceBundle("en", "autoCheckin", autoCheckin, true, true)
  })

  it.each([undefined, null])(
    "skips campaigns with absent days without attempting makeup: %j",
    async (days) => {
      vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
        { id: 1, days },
      ] as never)
      const result = await relayForProvider.checkIn(mockAccount, {} as never)
      expect(result.status).toBe(CHECKIN_RESULT_STATUS.SKIPPED)
      expect(claimRelayForCheckIn).not.toHaveBeenCalled()
    },
  )

  it("distinguishes disabled campaigns from failed status discovery", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([])
    const controller = new AbortController()
    const context = {
      account: mockAccount,
      observedAt: Date.now(),
      signal: controller.signal,
    }
    await expect(relayForProvider.getStatus?.(context)).resolves.toMatchObject({
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    })
    expect(fetchRelayForCheckInCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    )
    vi.mocked(fetchRelayForCheckInCampaigns).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    )
    await expect(relayForProvider.getStatus?.(context)).resolves.toBeUndefined()
    await expect(
      relayForProvider.getStatus?.({ observedAt: Date.now() }),
    ).resolves.toBeUndefined()
  })

  it("reports a campaign fetch failure without dispatching a claim", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    )
    const result = await relayForProvider.checkIn(mockAccount, {} as never)
    expect(result.status).not.toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(claimRelayForCheckIn).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    "retains reward-only results and first-claim failures (failure=%s)",
    async (failure) => {
      vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
        {
          id: 1,
          name: "Monthly",
          start_date: "2026-10-01",
          end_date: "2026-10-31",
          makeups_used: 0,
          makeup_limit: 0,
          days: [
            {
              date: "2026-10-19",
              can_claim: true,
              claimed: false,
              can_makeup: false,
            },
          ],
        },
      ])
      if (failure)
        vi.mocked(claimRelayForCheckIn).mockRejectedValueOnce(
          new TypeError("Failed to fetch"),
        )
      else
        vi.mocked(claimRelayForCheckIn).mockResolvedValueOnce({
          is_makeup: false,
          quota_awarded: 0,
          reward_type: "benefit",
          benefits: [{ type: "burst_credits", burst_credits: 10 }],
        })
      const result = await relayForProvider.checkIn(mockAccount, {} as never)
      expect(result.reward).toBeUndefined()
      if (failure) {
        expect(result.status).not.toBe(CHECKIN_RESULT_STATUS.SUCCESS)
        expect(result.rawMessage).toContain("0 of 1")
        expect(result.rawMessage).toContain(
          autoCheckin.skipReasons.network_error,
        )
      } else {
        expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
        expect(result.rawMessage).toContain("10")
      }
      expect(claimRelayForCheckIn).toHaveBeenCalledOnce()
    },
  )

  it("checks readiness based on access token presence", () => {
    expect(relayForProvider.getReadiness(mockAccount)).toEqual({ ready: true })

    const noTokenAccount = buildSiteAccount({
      site_type: SITE_TYPES.RELAYFOR,
      site_url: "https://relayfor.xyz",
      account_info: { ...defaultAccountInfo, access_token: "" },
    })
    expect(relayForProvider.getReadiness(noTokenAccount)).toEqual({
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
    })
  })

  it("getStatus reports unclaimed when a day can be claimed", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [
          {
            date: "2026-10-19",
            claimed: false,
            can_claim: true,
            can_makeup: false,
          },
        ],
      },
    ])

    const status = await relayForProvider.getStatus?.({
      account: mockAccount,
      observedAt: Date.now(),
    })

    expect(status).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    })
  })

  it("getStatus reports claimed when all active days are claimed", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [
          {
            date: "2026-10-19",
            claimed: true,
            can_claim: false,
            can_makeup: false,
          },
        ],
      },
    ])

    const status = await relayForProvider.getStatus?.({
      account: mockAccount,
      observedAt: Date.now(),
    })

    expect(status).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
    })
  })

  it("executes claim and reports success with quota reward", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [
          {
            date: "2026-10-19",
            claimed: false,
            can_claim: true,
            can_makeup: false,
          },
        ],
      },
    ])

    vi.mocked(claimRelayForCheckIn).mockResolvedValueOnce({
      is_makeup: false,
      reward_type: "quota",
      quota_awarded: 50000,
    })

    const result = await relayForProvider.checkIn(mockAccount, {} as never)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SUCCESS)
    expect(result.reward).toEqual({ quota: 50000 })
    expect(claimRelayForCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://relayfor.xyz" }),
      1,
      "2026-10-19",
    )
  })

  it("skips execution when already checked in", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [
          {
            date: "2026-10-19",
            claimed: true,
            can_claim: false,
            can_makeup: false,
          },
        ],
      },
    ])

    const result = await relayForProvider.checkIn(mockAccount, {} as never)

    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SKIPPED)
    expect(result.reasonCode).toBe(
      AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
    )
    expect(claimRelayForCheckIn).not.toHaveBeenCalled()
  })
  it("does not spend makeup opportunities as an automatic daily claim", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [
          {
            date: "2026-10-18",
            claimed: false,
            can_claim: false,
            can_makeup: true,
          },
        ],
      },
    ])
    const result = await relayForProvider.checkIn(mockAccount, {} as never)
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.SKIPPED)
    expect(result.rawMessage).toMatch(/console\/#overview/)
    expect(claimRelayForCheckIn).not.toHaveBeenCalled()
  })

  it("claims all available campaigns and retains noncash rewards", async () => {
    const campaign = {
      name: "Monthly",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      makeups_used: 0,
      makeup_limit: 3,
      days: [
        {
          date: "2026-10-19",
          claimed: false,
          can_claim: true,
          can_makeup: false,
        },
      ],
    }
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      { ...campaign, id: 1 },
      { ...campaign, id: 2 },
    ])
    vi.mocked(claimRelayForCheckIn)
      .mockResolvedValueOnce({
        is_makeup: false,
        reward_type: "quota",
        quota_awarded: 50000,
      })
      .mockResolvedValueOnce({
        is_makeup: false,
        reward_type: "subscription",
        quota_awarded: 0,
        subscription: { plan_name: "Monthly gift" },
      })
    const result = await relayForProvider.checkIn(mockAccount, {} as never)
    expect(claimRelayForCheckIn).toHaveBeenCalledTimes(2)
    expect(result.reward).toEqual({ quota: 50000 })
    expect(result.rawMessage).toContain("Monthly gift")
  })

  it("does not infer today's completion from an older fully claimed campaign", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Old",
        start_date: "2026-10-01",
        end_date: "2026-10-18",
        makeups_used: 0,
        makeup_limit: 0,
        days: [
          {
            date: "2026-10-18",
            claimed: true,
            can_claim: false,
            can_makeup: false,
          },
        ],
      },
    ])
    expect(
      await relayForProvider.getStatus?.({
        account: mockAccount,
        observedAt: Date.now(),
      }),
    ).toBeUndefined()
  })

  it("keeps today checked even when historical makeup remains", async () => {
    vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
      {
        id: 1,
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 3,
        days: [
          {
            date: "2026-10-18",
            claimed: false,
            can_claim: false,
            can_makeup: true,
          },
          {
            date: "2026-10-19",
            claimed: true,
            can_claim: false,
            can_makeup: false,
          },
        ],
      },
    ])
    expect(
      await relayForProvider.getStatus?.({
        account: mockAccount,
        observedAt: Date.now(),
      }),
    ).toMatchObject({ today: CHECK_IN_METHOD_TODAY_STATUSES.Checked })
  })

  it.each([false, true])(
    "classifies the current claim with confirmed partial progress (dispatched=%s)",
    async (dispatched) => {
      const campaign = {
        name: "Monthly",
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        makeups_used: 0,
        makeup_limit: 0,
        days: [
          {
            date: "2026-10-19",
            claimed: false,
            can_claim: true,
            can_makeup: false,
          },
        ],
      }
      vi.mocked(fetchRelayForCheckInCampaigns).mockResolvedValueOnce([
        { ...campaign, id: 1 },
        { ...campaign, id: 2 },
      ])
      const mutationLifecycle = {
        dispatched: false,
        responseReceived: false,
        onDispatch() {
          mutationLifecycle.dispatched = true
        },
        onResponse() {
          mutationLifecycle.responseReceived = true
        },
      }
      vi.mocked(claimRelayForCheckIn)
        .mockImplementationOnce(async (request) => {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          return {
            is_makeup: false,
            reward_type: "quota",
            quota_awarded: 50000,
            subscription: { plan_name: "Monthly gift" },
          }
        })
        .mockImplementationOnce(async (request) => {
          if (dispatched) request.observer?.onDispatch()
          throw new TypeError("Failed to fetch")
        })
      const result = await relayForProvider.checkIn(mockAccount, {
        mutationLifecycle,
      } as never)
      expect(result.status).toBe(
        dispatched
          ? CHECKIN_RESULT_STATUS.UNCERTAIN
          : CHECKIN_RESULT_STATUS.FAILED,
      )
      expect(mutationLifecycle.responseReceived).toBe(false)
      expect(result.status).not.toBe(CHECKIN_RESULT_STATUS.SUCCESS)
      expect(result.reward).toBeUndefined()
      expect(result.rawMessage).toContain("1 of 2")
      expect(result.rawMessage).toContain("Monthly gift")
      expect(result.rawMessage).toContain("0.1 USD")
      expect(claimRelayForCheckIn).toHaveBeenCalledTimes(2)
    },
  )
})
