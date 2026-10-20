import i18n from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import account from "~/locales/en/account.json"
import messages from "~/locales/en/messages.json"
import redemptionAssist from "~/locales/en/redemptionAssist.json"
import { relayForCapabilities } from "~/services/apiAdapters/relayfor"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse: vi.fn(),
}))

const request = {
  baseUrl: "https://relayfor.xyz",
  accountId: "relayfor-parity",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "fixture" },
  checkIn: buildCheckInConfig(),
}
const respond = (body: unknown) =>
  vi.mocked(fetchPreparedJsonResponse).mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: {},
    body,
  })

describe("RelayFor native account workflows", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    i18n.addResourceBundle("en", "account", account, true, true)
    i18n.addResourceBundle("en", "messages", messages, true, true)
    i18n.addResourceBundle(
      "en",
      "redemptionAssist",
      redemptionAssist,
      true,
      true,
    )
  })

  it("keeps permanent, timed, subscription and group allowances distinct", async () => {
    respond({
      user: { id: 1, username: "fixture", quota: 500000 },
      timed_quota: 1000000,
      group_quotas: [{ quota_group: "premium", quota: 2000000 }],
      total_quota: 250000,
      today: { requests: 0, input_tokens: 0, output_tokens: 0, quota: 0 },
      active_subscriptions: [
        {
          plan_name: "Monthly",
          status: 1,
          starts_at: "2020-01-01",
          expires_at: "2099-01-01",
          quota_remaining: 1500000,
          quota_group: "premium-only",
          model_rules: { "gpt-4o": {} },
          next_reset_at: "2098-12-01",
        },
        {
          plan_name: "Unlimited",
          status: 1,
          starts_at: "2020-01-01",
          expires_at: "2099-01-01",
          unlimited_quota: true,
        },
        {
          plan_name: "Expired",
          status: 2,
          starts_at: "2020-01-01",
          expires_at: "2020-02-01",
          quota_remaining: 5000000,
        },
      ],
    })
    const data = await relayForCapabilities.account!.data!.fetchData(request)
    expect(data.quota).toBe(500000)
    expect(data.nativeBalance).toMatchObject({
      unit: "USD",
      total: 6,
      permanent: 1,
      daily: 2,
      components: expect.arrayContaining([
        expect.objectContaining({
          kind: "subscription",
          name: "Monthly",
          amount: 3,
          scope: "premium-only",
          unlockedModels: ["gpt-4o"],
          resetAt: "2098-12-01",
        }),
        expect.objectContaining({
          kind: "subscription",
          name: "Unlimited",
          unlimited: true,
        }),
        expect.objectContaining({ kind: "group", scope: "premium", amount: 4 }),
      ]),
    })
    expect(data.subscription).toMatchObject({
      name: "Monthly · Unlimited",
      isActive: true,
    })
  })

  it("rejects incomplete overview envelopes and never marks missing metrics complete", async () => {
    respond({ user: { id: 1, username: "fixture", quota: 500000 } })
    await expect(
      relayForCapabilities.account!.data!.fetchData(request),
    ).rejects.toThrow()
    respond({
      user: { id: 1, username: "fixture", quota: 500000 },
      today: { requests: 0 },
    })
    const data = await relayForCapabilities.account!.data!.fetchData(request)
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "unavailable" },
      tokens: { status: "unavailable" },
      requests: { status: "complete" },
    })
  })

  it("exposes the official announcement through the shared site capability", async () => {
    respond({ content: "Scheduled maintenance" })
    expect(
      await relayForCapabilities.site!.announcements!.fetch(request),
    ).toEqual([{ content: "Scheduled maintenance" }])
  })

  it("publishes key allowance, restrictions and budget recovery as display facts", async () => {
    respond([
      {
        id: 7,
        name: "Restricted",
        key: "sk-****",
        status: 1,
        remain_quota: -1,
        used_quota: 250000,
        unlimited_quota: false,
        model_limits: ["gpt-4o"],
        ip_limits: "10.0.0.0/8",
        expired_at: "2099-01-01T00:00:00Z",
        limits: { requests_per_minute: 20, concurrent_requests: 2 },
        budget_usage: [
          {
            window: "day",
            limit: 1000000,
            used: 500000,
            remaining: 400000,
            reserved: 100000,
            next_reset_at: "2098-12-01T16:00:00Z",
          },
        ],
      },
    ])
    const session =
      await relayForCapabilities.account!.keyResourceManagement!.open({
        account: {
          id: request.accountId,
          name: "RelayFor",
          siteType: SITE_TYPES.RELAYFOR,
        },
        request,
      })
    const page = await (await session.openCollection("default")).list()
    expect(page.items[0]?.displayFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "money",
          role: "remaining",
          followsAccount: true,
        }),
        expect.objectContaining({
          kind: "money",
          role: "used",
          amountUsd: 0.5,
        }),
        expect.objectContaining({
          kind: "restriction",
          role: "models",
          value: ["gpt-4o"],
        }),
        expect.objectContaining({
          kind: "budget",
          window: "day",
          limitUsd: 2,
          usedUsd: 1,
          remainingUsd: 0.8,
          reservedUsd: 0.2,
        }),
        expect.objectContaining({
          kind: "rate-limit",
          rpm: 20,
          concurrency: 2,
        }),
      ]),
    )
    expect(page.items[0]?.detailAvailability).toBe("complete")
  })

  it("retains model access, consent, server group choice and separate endpoint charges", async () => {
    respond({
      items: [
        {
          model: "gpt-4o",
          accessible: false,
          access_reason: "Subscription required",
          effective_prices: { input: 2, output: 8 },
          data_training_consent_required: true,
          prompt_audit_enabled: true,
          prompt_audit_consent_required: true,
          prompt_audit_price: 0.03,
          effective_compaction_price: 0.05,
          remote_compaction_enabled: true,
          selected_group: "premium",
          model_groups: [
            { name: "premium", available: true, effective_multiplier: 2 },
            { name: "standard", available: false, effective_multiplier: 1 },
          ],
        },
      ],
    })
    const catalog =
      await relayForCapabilities.account!.modelPricing!.fetchPricing(request)
    expect(catalog.data[0]).toMatchObject({
      availability: { available: false, reason: "Subscription required" },
      providerGroup: {
        selected: "premium",
        options: [
          { value: "premium", available: true, multiplier: 2 },
          { value: "standard", available: false, multiplier: 1 },
        ],
      },
      presentation: {
        summaryFacts: expect.arrayContaining([
          expect.objectContaining({
            type: "boolean",
            value: true,
            label: expect.objectContaining({
              translationKey: "displayFacts.trainingConsent",
            }),
          }),
          expect.objectContaining({ type: "currency-price", amount: 0.03 }),
          expect.objectContaining({ type: "currency-price", amount: 0.05 }),
        ]),
      },
    })
  })

  it("does not advertise a disabled remote compaction endpoint as free", async () => {
    respond({
      items: [
        {
          model: "gpt-4o",
          effective_compaction_price: 0,
          remote_compaction_enabled: false,
        },
      ],
    })
    const catalog =
      await relayForCapabilities.account!.modelPricing!.fetchPricing(request)
    expect(catalog.data[0]?.presentation?.summaryFacts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.objectContaining({
            translationKey: "displayFacts.compactionCharge",
          }),
        }),
      ]),
    )
  })

  it("switches the provider routing group and reads accepted prices back", async () => {
    respond({})
    respond({
      items: [
        {
          model: "gpt-4o",
          selected_group: "standard",
          effective_prices: { input: 1, output: 4 },
        },
      ],
    })
    const result = await relayForCapabilities.account!.modelPricing!
      .updateGroup!(request, "gpt-4o", "standard")
    expect(
      JSON.parse(
        String(
          vi.mocked(fetchPreparedJsonResponse).mock.calls[0]?.[1].options.body,
        ),
      ),
    ).toEqual({ model: "gpt-4o", group: "standard" })
    expect(result.data[0]?.token_price_usd_per_million?.input).toBe(1)
  })

  it("uses hash routes for the official task and exposes redemption", async () => {
    const bootstrap = relayForCapabilities.account!.bootstrap!
    const target = { baseUrl: request.baseUrl, siteType: SITE_TYPES.RELAYFOR }
    expect(await bootstrap.resolveRoutePath!(target, "adminCredentials")).toBe(
      "/console/#tokens",
    )
    expect(await bootstrap.resolveRoutePath!(target, "usage")).toBe(
      "/console/#usage",
    )
    expect(await bootstrap.resolveRoutePath!(target, "redeem")).toBe(
      "/console/#redeem",
    )
    respond({ added_quota: 1000000, redeem_type: "quota" })
    expect(
      await relayForCapabilities.account!.redemption!.redeem({
        request,
        code: "fixture-code",
      }),
    ).toBe(1000000)
  })

  it("normalizes paginated usage with timestamps, refunds and cache meters", async () => {
    respond({
      items: [
        {
          id: 1,
          created_at: "2026-10-20T01:00:00Z",
          model: "gpt-4o",
          quota: 500000,
          prompt_tokens: 10,
          completion_tokens: 5,
          cached_tokens: 4,
          cache_write_tokens: 2,
          duration_ms: 1500,
          billing_detail: { refund_quota: 100000 },
        },
      ],
      total: 101,
      total_pages: 2,
    })
    const page = await relayForCapabilities.account!.usageHistory!.fetchPage(
      request,
      { page: 2, pageSize: 100, startTimestamp: 1, endTimestamp: 2 },
    )
    expect(page.total).toBe(101)
    expect(page.items[0]).toMatchObject({
      id: 1,
      created_at: 1792458000,
      model_name: "gpt-4o",
      quota: 400000,
      prompt_tokens: 10,
      completion_tokens: 5,
      use_time: 1.5,
    })
    const url = vi.mocked(fetchPreparedJsonResponse).mock.calls[0]?.[1].url
    expect(url).toContain("/api/user/logs?")
    expect(new URL(String(url)).searchParams.get("page")).toBe("2")
    expect(JSON.parse(page.items[0]!.other)).toMatchObject({
      cached_tokens: 4,
      cache_write_tokens: 2,
    })
  })
  it("explains TOTP at the failed mutation without replaying it", async () => {
    vi.mocked(fetchPreparedJsonResponse).mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: {},
      body: { error: { type: "totp_required", message: "TOTP required" } },
    })
    await expect(
      relayForCapabilities.account!.redemption!.redeem({
        request,
        code: "fixture",
      }),
    ).rejects.toMatchObject({
      upstreamCode: "totp_required",
      message: expect.stringMatching(/verification|验证码/i),
    })
    expect(fetchPreparedJsonResponse).toHaveBeenCalledTimes(1)
  })

  it("rejects an unconfirmed redemption and preserves subscription benefits", async () => {
    respond({})
    await expect(
      relayForCapabilities.account!.redemption!.redeem({
        request,
        code: "fixture",
      }),
    ).rejects.toThrow()
    respond({
      redeem_type: "subscription",
      subscription: { plan_name: "Monthly" },
      expires_at: "2099-01-01",
    })
    expect(
      await relayForCapabilities.account!.redemption!.redeem({
        request,
        code: "fixture",
      }),
    ).toMatchObject({ message: expect.stringContaining("Monthly") })
  })

  it("retains nested benefit allowances, scope and expiry in redemption feedback", async () => {
    respond({
      benefits: [
        {
          type: "subscription_trial",
          subscription: {
            plan_name: "Gift",
            quota_total: 1000000,
            expires_at: "2099-01-01T00:00:00Z",
          },
        },
        {
          type: "group_timed_quota",
          quota: 500000,
          quota_group: "premium",
          expires_at: "2099-02-01",
        },
        { type: "burst_credits", burst_credits: 100 },
      ],
    })
    const result = await relayForCapabilities.account!.redemption!.redeem({
      request,
      code: "fixture",
    })
    expect(result).toMatchObject({ message: expect.stringContaining("Gift") })
    expect(JSON.stringify(result)).toContain("2 USD")
    expect(JSON.stringify(result)).toContain("premium")
    expect(JSON.stringify(result)).toContain("2099")
    expect(JSON.stringify(result)).toContain("100")
  })

  it("preserves expiry of timed grants and reports partial detail failures", async () => {
    const overview = {
      user: { id: 1, username: "fixture", quota: 500000 },
      timed_quota: 1000000,
      today: { requests: 0 },
    }
    respond(overview)
    respond([
      {
        status: 1,
        name: "Prepaid",
        quota_remaining: 1000000,
        expires_at: "2099-01-01",
      },
    ])
    const first = await relayForCapabilities.account!.data!.fetchData(request)
    expect(
      first.nativeBalance?.unit === "USD"
        ? first.nativeBalance.timedDetails
        : undefined,
    ).toEqual([
      expect.objectContaining({
        name: "Prepaid",
        amount: 2,
        expiresAt: "2099-01-01",
      }),
    ])
    respond(overview)
    vi.mocked(fetchPreparedJsonResponse).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    const partial = await relayForCapabilities.account!.data!.fetchData(request)
    expect(partial.nativeBalance).toMatchObject({
      total: 3,
      timedDetailsUnavailable: true,
    })
  })
})
