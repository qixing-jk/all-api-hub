import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS } from "~/services/apiAdapters/contracts/accountBootstrap"
import { grsaiAccountBootstrap } from "~/services/apiAdapters/grsai/accountBootstrap"
import { grsaiAccountRefresh } from "~/services/apiAdapters/grsai/accountRefresh"
import { grsaiModelPricing } from "~/services/apiAdapters/grsai/modelPricing"
import {
  createGrsaiKey,
  deleteGrsaiKey,
  fetchAccountData,
  fetchGrsaiKeys,
  fetchUserInfo,
  updateGrsaiKey,
} from "~/services/apiService/grsai"
import { GRSAI_ENDPOINTS } from "~/services/apiService/grsai/constants"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

import { GRSAI_SIGNATURE_MATERIAL } from "./signatureFixture"

const origin = "https://eb.grsaiapi.com"
const request = {
  baseUrl: "https://grsai.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "stored" },
  checkIn: buildCheckInConfig(),
}
const key = {
  id: "key-id",
  name: "Test",
  key: "sk-fixture",
  credits: 500,
  type: 1,
}
const handle = (endpoint: string, data: unknown) =>
  http.post(`${origin}${endpoint}`, () => HttpResponse.json({ code: 0, data }))

describe("Grsai protocol operations", () => {
  it("reads all 101 keys across successive inventory pages", async () => {
    const inventory = Array.from({ length: 101 }, (_, index) => ({
      ...key,
      id: `key-${index}`,
    }))
    const pages: number[] = []
    server.use(
      http.post(
        `${origin}${GRSAI_ENDPOINTS.apiKeyList}`,
        async ({ request: req }) => {
          const { page, size } = (await req.json()) as {
            page: number
            size: number
          }
          pages.push(page)
          return HttpResponse.json({
            code: 0,
            data: {
              list: inventory.slice((page - 1) * size, page * size),
              total: inventory.length,
            },
          })
        },
      ),
    )
    await expect(fetchGrsaiKeys(request)).resolves.toEqual(inventory)
    expect(pages).toEqual([1, 2])
  })

  it("refuses an inventory whose advertised total cannot be retrieved", async () => {
    server.use(handle(GRSAI_ENDPOINTS.apiKeyList, { list: [key], total: 101 }))
    await expect(fetchGrsaiKeys(request)).rejects.toThrow(
      "incomplete_grsai_key_inventory",
    )
  })

  it("refuses repeated pages instead of looping or duplicating keys", async () => {
    const repeated = Array.from({ length: 100 }, (_, index) => ({
      ...key,
      id: `key-${index}`,
    }))
    server.use(
      handle(GRSAI_ENDPOINTS.apiKeyList, { list: repeated, total: 201 }),
    )
    await expect(fetchGrsaiKeys(request)).rejects.toThrow(
      "invalid_grsai_key_inventory",
    )
  })
  beforeEach(() => {
    server.resetHandlers()
    server.use(
      handle(GRSAI_ENDPOINTS.config, {
        ...GRSAI_SIGNATURE_MATERIAL,
        token: "rotated",
        isAuth: true,
      }),
      handle(GRSAI_ENDPOINTS.userInfo, {
        id: "user",
        mail: "user@example.invalid",
        credits: 5000,
      }),
      handle(GRSAI_ENDPOINTS.dashboard, { credits: 5000, todayConsumed: 10 }),
    )
  })

  it("signs key create, update and delete using the exchanged session", async () => {
    const seen: {
      endpoint: string
      auth: string | null
      signature: string | null
      body: unknown
    }[] = []
    server.use(
      ...[
        GRSAI_ENDPOINTS.apiKeyCreate,
        GRSAI_ENDPOINTS.apiKeyUpdate,
        GRSAI_ENDPOINTS.apiKeyDelete,
      ].map((endpoint) =>
        http.post(`${origin}${endpoint}`, async ({ request: req }) => {
          seen.push({
            endpoint,
            auth: req.headers.get("authorization"),
            signature: req.headers.get("xtx"),
            body: await req.json(),
          })
          return HttpResponse.json({
            code: 0,
            data: endpoint === GRSAI_ENDPOINTS.apiKeyCreate ? key : null,
          })
        }),
      ),
    )
    await expect(
      createGrsaiKey(request, { name: "Test", type: 1, credits: 500 }),
    ).resolves.toEqual(key)
    await updateGrsaiKey(request, {
      apiKey: key.key,
      name: "Renamed",
      type: 1,
      credits: 250,
      expireTime: 0,
    })
    await deleteGrsaiKey(request, key.id)
    expect(seen).toHaveLength(3)
    expect(
      seen.every(
        (item) =>
          item.auth === "rotated" &&
          /^[a-f0-9]{32}$/.test(item.signature ?? ""),
      ),
    ).toBe(true)
    expect(seen[2]?.body).toEqual({ id: "key-id" })
  })

  it("reads a valid key inventory and refuses malformed key rows", async () => {
    server.use(handle(GRSAI_ENDPOINTS.apiKeyList, { list: [key] }))
    await expect(fetchGrsaiKeys(request)).resolves.toEqual([key])
    server.use(handle(GRSAI_ENDPOINTS.apiKeyList, { list: [{ id: "bad" }] }))
    await expect(fetchGrsaiKeys(request)).rejects.toThrow(
      "invalid_grsai_key_inventory",
    )
    server.use(handle(GRSAI_ENDPOINTS.apiKeyCreate, null))
    await expect(
      createGrsaiKey(request, { name: "Test", type: 0 }),
    ).rejects.toThrow("invalid_grsai_key_create")
  })

  it("exposes bootstrap identity, access token, supported routes and no check-in", async () => {
    await expect(
      grsaiAccountBootstrap.fetchUserInfo(request),
    ).resolves.toMatchObject({
      id: "user",
      username: "user@example.invalid",
      access_token: "rotated",
    })
    await expect(
      grsaiAccountBootstrap.getOrCreateAccessToken(request),
    ).resolves.toMatchObject({
      username: "user@example.invalid",
      access_token: "rotated",
    })
    await expect(
      grsaiAccountBootstrap.fetchCheckInSupport(request, {}),
    ).resolves.toBe(false)
    await expect(
      grsaiAccountBootstrap.loadBootstrapFacts(request),
    ).resolves.toMatchObject({ defaultExchangeRate: 6.66 })
    await expect(
      grsaiAccountBootstrap.resolveRoutePath(
        { siteType: SITE_TYPES.GRSAI, baseUrl: request.baseUrl },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("/dashboard/api-keys")
  })

  it("refreshes through the adapter and reads priced models through the console", async () => {
    await expect(
      grsaiAccountRefresh.refreshAccount(request),
    ).resolves.toMatchObject({
      success: true,
      authUpdate: { accessToken: "rotated" },
    })
    await expect(
      grsaiAccountRefresh.fetchCheckInSupport!(request),
    ).resolves.toBe(false)
    server.use(
      handle(GRSAI_ENDPOINTS.modelList, {
        list: [{ id: "model-id", name: "gpt-fixture", credits: "100" }],
      }),
    )
    const catalog = await grsaiModelPricing.fetchPricing(request)
    expect(catalog.data[0]?.model_name).toBe("gpt-fixture")
    expect(catalog.data[0]?.model_price).toBeGreaterThan(0)
  })

  it("rejects malformed envelopes and HTTP errors", async () => {
    server.use(
      http.post(`${origin}${GRSAI_ENDPOINTS.apiKeyList}`, () =>
        HttpResponse.json({ success: true }),
      ),
    )
    await expect(fetchGrsaiKeys(request)).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
    server.use(
      http.post(`${origin}${GRSAI_ENDPOINTS.apiKeyList}`, () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    )
    await expect(fetchGrsaiKeys(request)).rejects.toMatchObject({
      statusCode: 503,
    })
  })

  it("rejects invalid identity and dashboard data instead of saving it", async () => {
    server.use(handle(GRSAI_ENDPOINTS.userInfo, { id: "" }))
    await expect(fetchUserInfo(request)).rejects.toThrow(
      "invalid_grsai_user_info",
    )
    server.use(
      handle(GRSAI_ENDPOINTS.userInfo, { id: "user", credits: 5000 }),
      handle(GRSAI_ENDPOINTS.dashboard, { credits: null }),
    )
    await expect(fetchAccountData(request)).rejects.toThrow(
      "invalid_grsai_dashboard",
    )
  })

  it("falls back to dashboard credits and marks missing consumption unavailable", async () => {
    server.use(
      handle(GRSAI_ENDPOINTS.userInfo, { id: "user" }),
      handle(GRSAI_ENDPOINTS.dashboard, { credits: "66600" }),
    )
    const data = await fetchAccountData(request)
    expect(data.quota).toBe(500000)
    expect(data.today_quota_consumption).toBe(0)
    expect(data.todayStatsAvailability?.consumption).toMatchObject({
      status: "unavailable",
      reason: "request_failed",
    })
    await expect(fetchUserInfo(request)).resolves.toMatchObject({
      username: "user",
    })
  })

  it("does not return an auth update when the session did not rotate", async () => {
    server.use(
      handle(GRSAI_ENDPOINTS.config, {
        ...GRSAI_SIGNATURE_MATERIAL,
        token: "stored",
        isAuth: true,
      }),
    )
    const result = await grsaiAccountRefresh.refreshAccount(request)
    expect(result.success).toBe(true)
    expect(result).not.toHaveProperty("authUpdate")
  })
})
