import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dayaCapabilities } from "~/services/apiAdapters/daya"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://api.dayaai.com"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "123" },
}
const envelope = (data: unknown) => ({ code: 0, message: "success", data })

beforeEach(() => {
  installCookieTransport("daya_sid", "api.dayaai.com")
  server.use(
    http.get(`${origin}/api/v1/auth/me`, () =>
      HttpResponse.json(
        envelope({ id: 123, username: "test-user", balance: 3.5 }),
      ),
    ),
  )
})
afterEach(() => vi.restoreAllMocks())

describe("Daya account redemption", () => {
  it("accepts the native successful delivery state", async () => {
    server.use(
      http.post(`${origin}/api/v1/code/apply`, () =>
        HttpResponse.json(
          envelope({ type: "balance", value: 2, delivery_status: "success" }),
        ),
      ),
    )
    await expect(
      dayaCapabilities.account!.redemption!.redeem({
        request,
        code: "DELIVERED",
      }),
    ).resolves.toBe(1_000_000)
  })

  it("directs referral discounts to the native checkout without claiming credit", async () => {
    server.use(
      http.post(`${origin}/api/v1/code/apply`, () =>
        HttpResponse.json(
          envelope({
            kind: "referral_discount",
            code: "DISCOUNT",
            pay_percentage: 80,
            message: "Discount applied",
          }),
        ),
      ),
    )
    await expect(
      dayaCapabilities.account!.redemption!.redeem({
        request,
        code: "DISCOUNT",
      }),
    ).rejects.toThrow("Discount applied")
  })

  it.each(["pending", "failed", "unknown"])(
    "does not claim credit for %s delivery",
    async (delivery_status) => {
      server.use(
        http.post(`${origin}/api/v1/code/apply`, () =>
          HttpResponse.json(
            envelope({
              type: "balance",
              value: 10,
              delivery_status,
              message: "Delivery is incomplete",
            }),
          ),
        ),
      )
      await expect(
        dayaCapabilities.account!.redemption!.redeem({
          request,
          code: `DELIVERY-${delivery_status}`,
        }),
      ).rejects.toThrow()
    },
  )

  it("keeps the idempotency key across an uncertain retry", async () => {
    const keys: string[] = []
    server.use(
      http.post(`${origin}/api/v1/code/apply`, ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key")!)
        return keys.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(envelope({ type: "balance", value: 1 }))
      }),
    )
    await expect(
      dayaCapabilities.account!.redemption!.redeem({ request, code: "RETRY" }),
    ).rejects.toThrow()
    await expect(
      dayaCapabilities.account!.redemption!.redeem({ request, code: "RETRY" }),
    ).resolves.toBe(500_000)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it.each([
    null,
    {},
    { type: "balance", value: -1 },
    { type: "balance", value: "2" },
    { type: "balance", value: 1, benefits: [{ kind: "api_subscription" }] },
  ])("rejects unconfirmed or mixed monetary results %#", async (result) => {
    server.use(
      http.post(`${origin}/api/v1/code/apply`, () =>
        HttpResponse.json(envelope(result)),
      ),
    )
    await expect(
      dayaCapabilities.account!.redemption!.redeem({
        request,
        code: "INVALID",
      }),
    ).rejects.toThrow()
  })

  it("preserves the provider rejection without a legacy fallback", async () => {
    const legacy = vi.fn()
    server.use(
      http.post(`${origin}/api/v1/code/apply`, () =>
        HttpResponse.json(
          {
            code: 404,
            message: "兑换码或推广码不存在",
            reason: "code_not_found",
          },
          { status: 404 },
        ),
      ),
      http.post(`${origin}/api/v1/redeem`, legacy),
    )
    await expect(
      dayaCapabilities.account!.redemption!.redeem({
        request,
        code: "MISSING",
      }),
    ).rejects.toThrow("兑换码或推广码不存在")
    expect(legacy).not.toHaveBeenCalled()
  })

  it("checks the bound identity before applying a code", async () => {
    const apply = vi.fn()
    server.use(http.post(`${origin}/api/v1/code/apply`, apply))
    await expect(
      dayaCapabilities.account!.redemption!.redeem({
        request: { ...request, auth: { ...request.auth, userId: "other" } },
        code: "WRONG-ACCOUNT",
      }),
    ).rejects.toThrow()
    expect(apply).not.toHaveBeenCalled()
  })

  it("rejects blank input before sending a mutation", async () => {
    const apply = vi.fn()
    server.use(http.post(`${origin}/api/v1/code/apply`, apply))
    await expect(
      dayaCapabilities.account!.redemption!.redeem({ request, code: "  " }),
    ).rejects.toThrow()
    expect(apply).not.toHaveBeenCalled()
  })

  it.each([
    {
      type: "concurrency",
      value: 5,
      new_concurrency: 55,
      message: "Added 5 concurrent requests",
    },
    {
      type: "subscription",
      group_name: "Trial",
      validity_days: 30,
      message: "Assigned a 30-day Trial subscription",
    },
  ])(
    "keeps a confirmed $type benefit out of monetary credit",
    async (result) => {
      server.use(
        http.post(`${origin}/api/v1/code/apply`, () =>
          HttpResponse.json(envelope(result)),
        ),
      )
      await expect(
        dayaCapabilities.account!.redemption!.redeem({ request, code: "CODE" }),
      ).resolves.toEqual({ message: result.message })
    },
  )

  it("credits a confirmed USD balance through the account redemption capability", async () => {
    let submitted: unknown
    server.use(
      http.post(`${origin}/api/v1/code/apply`, async ({ request }) => {
        submitted = await request.json()
        expect(request.headers.get("Idempotency-Key")).toBe(
          (submitted as { idempotency_key: string }).idempotency_key,
        )
        return HttpResponse.json(
          envelope({ type: "balance", value: 2.5, new_balance: 6 }),
        )
      }),
    )
    expect(dayaCapabilities.account?.redemption).toBeDefined()
    const amount = await dayaCapabilities.account!.redemption!.redeem({
      request,
      code: "  CaseSensitiveCode  ",
    })
    expect(amount).toBe(1_250_000)
    expect(submitted).toEqual({
      code: "CaseSensitiveCode",
      channel: "purchase",
      ref: "console-topup",
      idempotency_key: expect.any(String),
    })
  })
})
