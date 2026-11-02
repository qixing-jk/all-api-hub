import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { browser } from "wxt/browser"

import { Storage } from "@plasmohq/storage"

import { aimlApiAccountPersistence } from "~/services/apiAdapters/aimlapi/accountPersistence"
import { obtainAimlApiConnectionKey } from "~/services/apiAdapters/aimlapi/connectionCredentials"
import { AIMLAPI_ONBOARDING_STORAGE_KEY } from "~/services/core/storageKeys"
import { server } from "~~/tests/msw/server"

const keyRecord = {
  prefix: "abcdefgh",
  name: "AAH",
  disabled: false,
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
  expires_at: null,
  total_usage_usd: 0,
  monthly_usage_usd: 0,
}

const storage = new Storage({ area: "local" })
const ready = (key: string) => ({
  state: "ready",
  key,
  id: key,
  prefix: "abcdefgh",
})
const read = () =>
  storage.get<Record<string, unknown>>(AIMLAPI_ONBOARDING_STORAGE_KEY)
afterEach(() => vi.unstubAllGlobals())
beforeEach(async () => {
  await storage.set(AIMLAPI_ONBOARDING_STORAGE_KEY, {
    "123": { management: ready("management"), regular: ready("regular") },
    other: {
      management: ready("other-management"),
      regular: { state: "pending" },
    },
  })
})

it("forgets only the rejected credential when management verification returns 401", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      aimlApiKey: "regular",
      userId: "123",
    }),
  ).rejects.toMatchObject({ statusCode: 401 })
  expect(await read()).toEqual({
    "123": { regular: ready("regular") },
    other: {
      management: ready("other-management"),
      regular: { state: "pending" },
    },
  })
})

it("removes deleted-account secrets while preserving uncertain issuance and other users", async () => {
  await aimlApiAccountPersistence.cleanupDeletedAccount!({
    account_info: { id: "123", access_token: "management" },
    aimlApiAuth: { apiKey: "regular" },
  } as never)
  expect(await read()).toEqual({
    other: {
      management: ready("other-management"),
      regular: { state: "pending" },
    },
  })
  await aimlApiAccountPersistence.cleanupDeletedAccount!({
    account_info: { id: "other", access_token: "other-management" },
  } as never)
  expect(await read()).toEqual({ other: { regular: { state: "pending" } } })
  await expect(
    obtainAimlApiConnectionKey("other", "regular", async () => {
      throw new Error("must not issue")
    }),
  ).rejects.toThrow("issuance")
})

it("cleans an issued management-only key when the saved identity is its prefix", async () => {
  await storage.set(AIMLAPI_ONBOARDING_STORAGE_KEY, {
    "123": { management: ready("management"), regular: { state: "pending" } },
    other: { management: ready("other-management") },
  })
  await aimlApiAccountPersistence.cleanupDeletedAccount!({
    account_info: { id: "abcdefgh", access_token: "management" },
  } as never)
  expect(await read()).toEqual({
    "123": { regular: { state: "pending" } },
    other: { management: ready("other-management") },
  })
})

it("forgets the regular key alone when its verification returns 401", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({ data: keyRecord }),
    ),
    http.get("https://api.aimlapi.com/v2/billing/detail", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      aimlApiKey: "regular",
      userId: "123",
    }),
  ).rejects.toMatchObject({ statusCode: 401 })
  expect((await read())?.["123"]).toEqual({ management: ready("management") })
})

it.each([403, 500, "network"])(
  "keeps credentials after inconclusive verification: %s",
  async (status) => {
    const before = await read()
    server.use(
      http.get("https://api.aimlapi.com/v1/key", () =>
        status === "network"
          ? HttpResponse.error()
          : HttpResponse.json({}, { status: status as number }),
      ),
    )
    await expect(
      aimlApiAccountPersistence.prepareIdentity({
        accessToken: "management",
        userId: "123",
      }),
    ).rejects.toThrow()
    expect(await read()).toEqual(before)
  },
)

it("does not erase a rotated credential when an older key is rejected", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  const before = await read()
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "old-management",
      userId: "123",
    }),
  ).rejects.toThrow()
  expect(await read()).toEqual(before)
})

it("admits only one issuance while the first request is pending", async () => {
  const create = vi.fn(async () => ({
    key: "new-key",
    id: "new",
    prefix: "abcdefgh",
  }))
  const results = await Promise.allSettled([
    obtainAimlApiConnectionKey("new-user", "management", create),
    obtainAimlApiConnectionKey("new-user", "management", create),
  ])
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1)
  expect(create).toHaveBeenCalledOnce()
  expect(
    await obtainAimlApiConnectionKey("new-user", "management", create),
  ).toMatchObject({ key: "new-key" })
  expect(create).toHaveBeenCalledOnce()
})

it.each([undefined, {}, { request: undefined }])(
  "does not dispatch issuance without a cross-context lock: %j",
  async (locks) => {
    vi.stubGlobal("navigator", { locks })
    const before = await read()
    const create = vi.fn(async () => ({
      key: "new-key",
      id: "new",
      prefix: "abcdefgh",
    }))
    await expect(
      obtainAimlApiConnectionKey("new-user", "management", create),
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
    expect(await read()).toEqual(before)
  },
)

it("retains uncertainty when the issuance ledger disappears before confirmation", async () => {
  await expect(
    obtainAimlApiConnectionKey("new-user", "regular", async () => {
      await storage.remove(AIMLAPI_ONBOARDING_STORAGE_KEY)
      return { key: "created-key", id: "created", prefix: "abcdefgh" }
    }),
  ).rejects.toThrow("issuance_unconfirmed")
})

it("does not replace an unreadable ledger or mask the original invalid-credential error", async () => {
  const before = await read()
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({}, { status: 401 }),
    ),
  )
  const get = vi
    .spyOn(browser.storage.local, "get")
    .mockRejectedValueOnce(new Error("storage read failed"))
  await expect(
    aimlApiAccountPersistence.prepareIdentity({
      accessToken: "management",
      userId: "123",
    }),
  ).rejects.toMatchObject({ statusCode: 401 })
  get.mockRestore()
  expect(await read()).toEqual(before)
})
