import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createKrillKey,
  deleteKrillKey,
  fetchKrillChannels,
  fetchKrillKey,
  fetchKrillKeys,
  updateKrillKey,
} from "~/services/apiService/krill/keys"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://www.krill-code.com"
const listItem = {
  id: 71750,
  name: "native",
  token_prefix: "nb_522MZ",
  last_used_at: "2026-10-14T16:40:00Z",
  revoked_at: null,
  allow_balance_fallback: true,
  ip_whitelist: null,
  ip_whitelist_grey: false,
  ip_whitelist_disabled: false,
  created_at: "2026-10-14T17:23:37Z",
  enterprise_id: null,
}
const revoked = {
  ...listItem,
  id: 71751,
  name: "retired",
  token_prefix: "nb_AbCdE",
  revoked_at: "2026-10-14T18:00:00Z",
  last_used_at: null,
  ip_whitelist: "203.0.113.4, 198.51.100.0/24",
}
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "47044" },
}
const calls: { method: string; url: string; body?: unknown }[] = []

function record() {
  server.use(
    http.get(`${origin}/api/tokens`, () =>
      HttpResponse.json({ success: true, code: 0, data: [listItem, revoked] }),
    ),
    http.get(`${origin}/api/tokens/:id/channels`, ({ params }) =>
      HttpResponse.json({
        success: true,
        code: 0,
        data: {
          channel_ids: params.id === "71751" ? [55, 35] : [],
        },
      }),
    ),
    http.post(`${origin}/api/tokens`, async ({ request }) => {
      calls.push({
        method: "POST",
        url: "/api/tokens",
        body: await request.json(),
      })
      return HttpResponse.json({
        success: true,
        code: 0,
        data: {
          token: "nb_new-secret-value",
          item: { ...listItem, id: 90001, name: "probe" },
        },
      })
    }),
    http.put(`${origin}/api/tokens/:id`, async ({ request, params }) => {
      calls.push({
        method: "PUT",
        url: `/api/tokens/${params.id}`,
        body: await request.json(),
      })
      return HttpResponse.json({ success: true, code: 0, data: null })
    }),
    http.put(
      `${origin}/api/tokens/:id/channels`,
      async ({ request, params }) => {
        calls.push({
          method: "PUT",
          url: `/api/tokens/${params.id}/channels`,
          body: await request.json(),
        })
        return HttpResponse.json({ success: true, code: 0, data: null })
      },
    ),
    http.delete(`${origin}/api/tokens/:id/destroy`, ({ params }) => {
      calls.push({ method: "DELETE", url: `/api/tokens/${params.id}/destroy` })
      return HttpResponse.json({ success: true, code: 0, data: null })
    }),
  )
}

describe("Krill AI key management", () => {
  let browserBoundary: ReturnType<typeof installCookieTransport>
  beforeEach(() => {
    calls.length = 0
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: {
            id: 47044,
            email: "kai@example.com",
            credit_balance_usd: "12.500000",
            enterprise_memberships: [],
          },
        }),
      ),
    )
    browserBoundary = installCookieTransport()
    browserBoundary.cookies.mockResolvedValue([
      {
        name: "krill_jwt",
        value: "console-session",
        domain: "www.krill-code.com",
        path: "/",
        secure: true,
        httpOnly: false,
        hostOnly: true,
        session: false,
        sameSite: "lax",
        storeId: "0",
        firstPartyDomain: "",
        expirationDate: Date.now() / 1000 + 3600,
      },
    ])
  })
  afterEach(() => vi.restoreAllMocks())

  it("lists native keys with an optional name", async () => {
    server.use(
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json({
          success: true,
          data: [{ ...listItem, name: null }],
        }),
      ),
    )
    await expect(fetchKrillKeys(request as never)).resolves.toMatchObject([
      { id: 71750, name: "" },
    ])
  })

  it("uses the captured console JWT as Bearer on account API routes", async () => {
    let authorization: string | null = null
    server.use(
      http.get(`${origin}/api/tokens`, ({ request }) => {
        authorization = request.headers.get("authorization")
        return HttpResponse.json({ success: true, data: [] })
      }),
    )
    await fetchKrillKeys(request as never)
    expect(authorization).toBe("Bearer console-session")
  })

  it("creates a key by name only and returns its one-time plaintext", async () => {
    record()
    const result = await createKrillKey(request as never, { name: "probe" })

    expect(calls).toEqual([
      { method: "POST", url: "/api/tokens", body: { name: "probe" } },
    ])
    expect(result.secret).toBe("nb_new-secret-value")
    expect(result.item).toMatchObject({ id: 90001, name: "probe" })
  })

  it("maps inventory, marking revoked keys and preserving the IP whitelist", async () => {
    record()
    const keys = await fetchKrillKeys(request as never)

    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatchObject({
      id: 71750,
      name: "native",
      tokenPrefix: "nb_522MZ",
      revoked: false,
      allowBalanceFallback: true,
      ipWhitelist: null,
      lastUsedAt: "2026-10-14T16:40:00Z",
    })
    expect(keys[1]).toMatchObject({
      revoked: true,
      ipWhitelist: ["203.0.113.4", "198.51.100.0/24"],
      lastUsedAt: null,
    })
  })

  it("reads a key's channel selection through its own route", async () => {
    record()
    await expect(
      fetchKrillKey(request as never, "71750"),
    ).resolves.toMatchObject({ channelIds: [] })
    await expect(
      fetchKrillKey(request as never, "71751"),
    ).resolves.toMatchObject({ channelIds: [55, 35] })
  })

  it("writes editable settings and channels through their separate routes", async () => {
    record()
    await updateKrillKey(request as never, {
      id: 71750,
      name: "renamed",
      allowBalanceFallback: false,
      ipWhitelist: ["203.0.113.4"],
      channelIds: [55, 1],
    })

    const settings = calls.find((call) => call.url === "/api/tokens/71750")
    expect(settings?.body).toEqual({
      name: "renamed",
      allow_balance_fallback: false,
      ip_whitelist: "203.0.113.4",
    })
    expect(
      calls.find((call) => call.url === "/api/tokens/71750/channels")?.body,
    ).toEqual({ provider_ids: [55, 1] })
  })

  it("deletes through the destroy route", async () => {
    record()
    await deleteKrillKey(request as never, "71750")
    expect(calls).toContainEqual({
      method: "DELETE",
      url: "/api/tokens/71750/destroy",
    })
  })

  it("lists the routable channels with their billing multipliers", async () => {
    server.use(
      http.get(`${origin}/api/my/channels`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: [
            {
              id: 55,
              name: "国产模型官渠",
              billing_multiplier: "0.3500",
              default_routed: true,
            },
            {
              id: 35,
              name: "Kiro 渠道",
              billing_multiplier: "0.3800",
              default_routed: false,
            },
          ],
        }),
      ),
    )
    await expect(fetchKrillChannels(request as never)).resolves.toEqual([
      {
        id: 55,
        name: "国产模型官渠",
        billingMultiplier: 0.35,
        defaultRouted: true,
      },
      {
        id: 35,
        name: "Kiro 渠道",
        billingMultiplier: 0.38,
        defaultRouted: false,
      },
    ])
  })
  it.each(["0", "-1", "1/other", "9007199254740992"])(
    "rejects invalid key locators %s before mutation",
    async (id) => {
      record()
      await expect(deleteKrillKey(request as never, id)).rejects.toThrow()
      expect(calls).toEqual([])
    },
  )
  it.each([
    { ...listItem, id: 0 },
    { ...listItem, ip_whitelist: [] },
  ])("rejects invalid inventory rows %j", async (item) => {
    server.use(
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json({ success: true, data: [item] }),
      ),
    )
    await expect(fetchKrillKeys(request as never)).rejects.toThrow()
  })
  it.each([null, { channel_ids: [-1] }])(
    "rejects malformed key channel data %j",
    async (data) => {
      record()
      server.use(
        http.get(`${origin}/api/tokens/:id/channels`, () =>
          HttpResponse.json({ success: true, data }),
        ),
      )
      await expect(fetchKrillKey(request as never, "71750")).rejects.toThrow()
    },
  )
  it.each([null, { token: " " }])(
    "rejects create responses without a usable secret %j",
    async (data) => {
      server.use(
        http.post(`${origin}/api/tokens`, () =>
          HttpResponse.json({ success: true, data }),
        ),
      )
      await expect(
        createKrillKey(request as never, { name: "" }),
      ).rejects.toThrow()
    },
  )
  it.each([
    { id: 0, name: "bad", default_routed: true, billing_multiplier: "1" },
    {
      id: 1,
      name: "bad",
      default_routed: true,
      billing_multiplier: "9".repeat(400),
    },
  ])("rejects invalid channel catalog rows %j", async (item) => {
    server.use(
      http.get(`${origin}/api/my/channels`, () =>
        HttpResponse.json({ success: true, data: [item] }),
      ),
    )
    await expect(fetchKrillChannels(request as never)).rejects.toThrow()
  })
  it("sends null for a cleared edit name and preserves native IP bypass", async () => {
    record()
    await updateKrillKey(request as never, {
      id: 71750,
      name: " ",
      allowBalanceFallback: true,
      ipWhitelist: [],
      ipWhitelistDisabled: true,
      channelIds: [],
    })
    expect(calls[0]!.body).toMatchObject({
      name: null,
      ip_whitelist_disabled: true,
    })
  })
})
