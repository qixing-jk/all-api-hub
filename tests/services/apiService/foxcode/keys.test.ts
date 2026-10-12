import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { buildAccountKeyResourceRuntimeKeyFromFacts } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  ACCOUNT_RUNTIME_KEY_SECRET_SOURCES,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { FOXCODE_KEY_EDITOR_FIELDS } from "~/services/apiAdapters/foxcode/keyEditorFields"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  createKey,
  deleteKey,
  fetchKeys,
  updateKey,
} from "~/services/apiService/foxcode/keys"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const origin = "https://foxcode.rjj.cc"
const userId = "sample-account"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId },
}
const key = {
  id: "key-one",
  userId,
  name: "Work",
  description: "Keep this",
  key: "sk-sample-secret",
  channelKey: "anthropic",
  isActive: true,
  quotaLimit: 10000,
  quotaUsed: 200,
  createdAt: "2026-10-01T00:00:00Z",
  lastUsedAt: null,
}
const config = {
  channels: [
    {
      key: "anthropic",
      name: "Official",
      enabled: true,
      models: ["claude-sonnet"],
      quotaMultiplier: 0.125,
      groupKeys: ["anthropic"],
      baseUrl: "https://code1.newcli.com",
    },
    {
      key: "codex",
      name: "Codex",
      enabled: true,
      models: ["gpt-sample"],
      quotaMultiplier: 2 / 3,
      groupKeys: ["openai"],
    },
  ],
}

beforeEach(async () => {
  const boundary = installCookieTransport()
  const cookie = (await browser.cookies.getAll({}))[0]!
  boundary.cookies.mockResolvedValue([
    { ...cookie, domain: "foxcode.rjj.cc", name: "auth_token" },
  ])
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({
        success: true,
        data: { user: { id: userId, name: "Work" } },
      }),
    ),
    http.get(`${origin}/api/system-config/public/model_square_config`, () =>
      HttpResponse.json({ success: true, data: { config } }),
    ),
    http.get(`${origin}/api/system-config/public/api_endpoint_config`, () =>
      HttpResponse.json({
        success: true,
        data: {
          defaultKey: "primary",
          endpoints: [
            {
              key: "primary",
              baseUrl: "https://code1.newcli.com",
              enabled: true,
            },
          ],
        },
      }),
    ),
  )
})
afterEach(() => vi.restoreAllMocks())

it("still requires a channel for creation and refuses unbinding a restricted key", async () => {
  const write = vi.fn(() => HttpResponse.json({ success: true, data: {} }))
  server.use(
    http.post(`${origin}/api/keys`, write),
    http.patch(`${origin}/api/keys/${key.id}`, write),
  )
  await expect(
    createKey(request, { ...key, channelKey: null }),
  ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  await expect(
    updateKey(
      request,
      {
        ...key,
        modelIds: ["claude-sonnet"],
        baseUrl: "https://code1.newcli.com",
      },
      { ...key, channelKey: null },
    ),
  ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  expect(write).not.toHaveBeenCalled()
})

it("edits an unrestricted existing key without binding it to a channel", async () => {
  const unrestricted = { ...key, channelKey: null }
  const patches: unknown[] = []
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [unrestricted], pagination: { page: 1, pages: 1 } },
      }),
    ),
    http.patch(`${origin}/api/keys/${key.id}`, async ({ request }) => {
      patches.push(await request.json())
      return HttpResponse.json({ success: true, data: {} })
    }),
  )
  const session = await getSiteTypeCapabilities(
    "foxcode",
  ).account!.keyResourceManagement!.open({
    account: { id: "saved", siteType: "foxcode" },
    request: { ...request, accountId: "saved" },
  })
  const collection = await session.openCollection("account")
  const row = (await collection.list()).items[0]!
  const editor = await collection.openEditEditor(row.ref, undefined, {
    snapshot: row,
  })
  await editor.loadOptions!(
    FOXCODE_KEY_EDITOR_FIELDS.Channel,
    editor.initialValues,
  )
  const saved = await editor.submit({
    ...editor.initialValues,
    name: "Renamed",
  })
  expect(patches).toEqual([{ name: "Renamed" }])
  expect(saved.facts?.displayName).toBe("Renamed")
  expect(saved.facts?.runtimeKey?.modelAccess.groups).toEqual([])
  expect(saved.facts?.runtimeKey?.modelAccess.allowedModelIds).toBeNull()
})

it.each(["", "   ", "sk-****masked"])(
  "rejects unavailable or masked native secrets (%s) instead of exporting them",
  async (secret) => {
    server.use(
      http.get(`${origin}/api/keys`, () =>
        HttpResponse.json({
          success: true,
          data: {
            apiKeys: [{ ...key, key: secret }],
            pagination: { page: 1, pages: 1 },
          },
        }),
      ),
    )
    await expect(fetchKeys(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  },
)

it("refuses a changed live account before dispatching a native key mutation", async () => {
  const write = vi.fn()
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({
        success: true,
        data: { user: { id: "other-account" } },
      }),
    ),
    http.post(`${origin}/api/keys`, write),
  )
  await expect(createKey(request, key)).rejects.toMatchObject({
    code: "ACCOUNT_IDENTITY_MISMATCH",
  })
  expect(write).not.toHaveBeenCalled()
})

it("refuses conflicting edits before PATCH while preserving the native record", async () => {
  const write = vi.fn()
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: {
          apiKeys: [{ ...key, name: "Changed elsewhere" }],
          pagination: { page: 1, pages: 1 },
        },
      }),
    ),
    http.patch(`${origin}/api/keys/${key.id}`, write),
  )
  await expect(
    updateKey(
      request,
      {
        ...key,
        baseUrl: "https://code1.newcli.com",
        modelIds: ["claude-sonnet"],
      },
      { ...key, name: "Local change" },
    ),
  ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
  expect(write).not.toHaveBeenCalled()
})

it("loads all key pages and binds runtime model access to the native channel and inference origin", async () => {
  const pages: string[] = []
  server.use(
    http.get(`${origin}/api/keys`, ({ request }) => {
      const page = new URL(request.url).searchParams.get("page")!
      pages.push(page)
      return HttpResponse.json({
        success: true,
        data: {
          apiKeys: [page === "1" ? key : { ...key, id: "key-two" }],
          pagination: { page: Number(page), total: 2, pages: 2 },
        },
      })
    }),
  )
  const keys = await fetchKeys(request)
  expect(pages).toEqual(["1", "2"])
  expect(keys).toHaveLength(2)
  expect(keys[0]).toMatchObject({
    id: "key-one",
    channelKey: "anthropic",
    modelIds: ["claude-sonnet"],
    baseUrl: "https://code1.newcli.com",
    key: "sk-sample-secret",
  })
})

it("reuses the verified inventory plaintext for disclosure without any new provider request", async () => {
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [key], pagination: { page: 1, pages: 1 } },
      }),
    ),
  )
  const account = buildDisplaySiteData({
    id: "saved",
    siteType: "foxcode",
    baseUrl: origin,
    authType: AuthTypeEnum.Cookie,
    userId,
    token: "",
  })
  const session = await getSiteTypeCapabilities(
    "foxcode",
  ).account!.keyResourceManagement!.open({
    account: { id: account.id, siteType: "foxcode" },
    request: { ...request, accountId: account.id },
  })
  const collection = await session.openCollection("account")
  const page = await collection.list()
  const runtimeKey = buildAccountKeyResourceRuntimeKeyFromFacts(
    account,
    page.items[0]!,
  )
  const unexpectedRead = vi.fn(() => new HttpResponse(null, { status: 503 }))
  server.use(http.get(`${origin}/*`, unexpectedRead))
  await expect(
    resolveDisplayAccountRuntimeKeySecret(account, runtimeKey),
  ).resolves.toMatchObject({ secret: "sk-sample-secret" })
  expect(unexpectedRead).not.toHaveBeenCalled()
  expect(page.items[0]!.maskedLabel).not.toBe(key.key)
  await expect(
    resolveDisplayAccountRuntimeKeySecret(account, runtimeKey, {
      secretSource: ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.Provider,
    }),
  ).rejects.toThrow()
  expect(unexpectedRead).toHaveBeenCalledOnce()
})

it("creates a bound key with native fields once and confirms the persisted resource", async () => {
  const readInventory = vi.fn()
  const write = vi.fn(async ({ request }: { request: Request }) => {
    const input = await request.json()
    expect(input).toEqual({
      name: "Work",
      description: "Keep this",
      channelKey: "anthropic",
      quotaLimit: 10000,
    })

    return HttpResponse.json({ success: true, data: { apiKey: key } })
  })
  server.use(
    http.post(`${origin}/api/keys`, write),
    http.get(`${origin}/api/keys`, readInventory),
  )
  await expect(
    createKey(request, {
      name: "Work",
      description: "Keep this",
      channelKey: "anthropic",
      quotaLimit: 10000,
    }),
  ).resolves.toMatchObject({
    id: "key-one",
    key: "sk-sample-secret",
    baseUrl: "https://code1.newcli.com",
  })
  expect(write).toHaveBeenCalledTimes(1)
  expect(readInventory).not.toHaveBeenCalled()
})

it("patches only edited native fields and preserves concurrent untouched settings", async () => {
  let persisted = { ...key }
  const write = vi.fn(async ({ request }: { request: Request }) => {
    const input = await request.json()
    expect(input).toEqual({
      name: "Renamed",
      channelKey: "codex",
      quotaLimit: 20000,
      isActive: false,
    })
    persisted = { ...persisted, ...input }
    return HttpResponse.json({ success: true, data: { apiKey: persisted } })
  })
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [persisted], pagination: { page: 1, pages: 1 } },
      }),
    ),
    http.patch(`${origin}/api/keys/key-one`, write),
  )
  const baseline = (await fetchKeys(request))[0]!
  persisted.description = "Concurrent description"
  const saved = await updateKey(request, baseline, {
    name: "Renamed",
    description: baseline.description,
    channelKey: "codex",
    quotaLimit: 20000,
    isActive: false,
  })
  expect(saved).toMatchObject({
    name: "Renamed",
    description: "Concurrent description",
    channelKey: "codex",
    isActive: false,
    quotaLimit: 20000,
    key: key.key,
  })
  expect(write).toHaveBeenCalledTimes(1)
})

it("accepts native deletion without a data envelope", async () => {
  let exists = true
  const write = vi.fn(() => {
    exists = false
    return HttpResponse.json({ success: true, message: "Deleted" })
  })
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: {
          apiKeys: exists ? [key] : [],
          pagination: { page: 1, pages: 1 },
        },
      }),
    ),
    http.delete(`${origin}/api/keys/key-one`, write),
  )
  await expect(deleteKey(request, key.id)).resolves.toBeUndefined()
  expect(write).toHaveBeenCalledTimes(1)
})

it("opens the native key editor with every ordinary field and saves USD quota without losing the description", async () => {
  const persisted = { ...key }
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [persisted], pagination: { page: 1, pages: 1 } },
      }),
    ),
    http.patch(`${origin}/api/keys/key-one`, async ({ request }) => {
      expect(await request.json()).toEqual({ quotaLimit: 50000 })
      persisted.quotaLimit = 50000
      return HttpResponse.json({ success: true, data: { apiKey: persisted } })
    }),
  )
  const session = await getSiteTypeCapabilities(
    "foxcode",
  ).account!.keyResourceManagement!.open({
    account: { id: "saved", siteType: "foxcode" as const },
    request: { ...request, accountId: "saved" },
  })
  const collection = await session.openCollection("account")
  const page = await collection.list()
  const editor = await collection.openEditEditor(page.items[0]!.ref)
  expect(editor.fields.map((field) => field.fieldId)).toEqual([
    "name",
    "description",
    "channelKey",
    "unlimited",
    "quotaUsd",
    "enabled",
  ])
  expect(editor.initialValues).toMatchObject({
    description: "Keep this",
    channelKey: "anthropic",
    unlimited: false,
    quotaUsd: 0.01,
    enabled: true,
  })
  await editor.loadOptions!(
    FOXCODE_KEY_EDITOR_FIELDS.Channel,
    editor.initialValues,
  )
  const saved = await editor.submit({ ...editor.initialValues, quotaUsd: 0.05 })
  expect(saved.facts?.displayFacts).toContainEqual(
    expect.objectContaining({ kind: "money", role: "total", amountUsd: 0.05 }),
  )
  const reopened = await collection.openEditEditor(page.items[0]!.ref)
  expect(reopened.initialValues).toMatchObject({
    quotaUsd: 0.05,
    description: "Keep this",
    channelKey: "anthropic",
  })
})

it("accepts acknowledged deletion without inventory or runtime configuration reads", async () => {
  const reads: string[] = []
  let present = true
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).origin === origin)
      reads.push(new URL(request.url).pathname)
  })
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: {
          apiKeys: present ? [key] : [],
          pagination: { page: 1, pages: 1 },
        },
      }),
    ),
    http.delete(`${origin}/api/keys/${key.id}`, () => {
      present = false
      return HttpResponse.json({ success: true, data: {} })
    }),
  )
  try {
    await deleteKey(request, key.id)
    expect(reads).toEqual(["/api/auth/me", `/api/keys/${key.id}`])
  } finally {
    server.events.removeAllListeners("request:start")
  }
})

it("retains runtime routing when an untouched channel changed concurrently", async () => {
  const baseline = {
    ...key,
    modelIds: ["claude-sonnet"],
    baseUrl: "https://code1.newcli.com",
  }
  let persisted = { ...key, channelKey: "codex" }
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [persisted], pagination: { page: 1, pages: 1 } },
      }),
    ),
    http.patch(`${origin}/api/keys/${key.id}`, async ({ request }) => {
      persisted = {
        ...persisted,
        ...((await request.json()) as Partial<typeof key>),
      }
      return HttpResponse.json({ success: true, data: {} })
    }),
  )
  const saved = await updateKey(request, baseline, { ...key, name: "Renamed" })
  expect(saved).toMatchObject({ channelKey: "codex", modelIds: ["gpt-sample"] })
})

it("reuses runtime configuration across editor reads and uses the shared fresh detail once", async () => {
  let persisted = { ...key }
  const calls: string[] = []
  const track = ({ request }: { request: Request }) => {
    if (new URL(request.url).origin === origin)
      calls.push(new URL(request.url).pathname)
  }
  server.events.on("request:start", track)
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [persisted], pagination: { page: 1, pages: 1 } },
      }),
    ),
    http.patch(`${origin}/api/keys/${key.id}`, async ({ request }) => {
      const patch = (await request.json()) as Partial<typeof key>
      expect(patch).toEqual({ name: "Renamed" })
      persisted = { ...persisted, ...patch }
      return HttpResponse.json({ success: true, data: {} })
    }),
  )
  try {
    const session = await getSiteTypeCapabilities(
      "foxcode",
    ).account!.keyResourceManagement!.open({
      account: { id: "saved", siteType: "foxcode" },
      request: { ...request, accountId: "saved" },
    })
    const collection = await session.openCollection("account")
    const page = await collection.list()
    const editor = await collection.openEditEditor(page.items[0]!.ref)
    await editor.loadOptions!(
      FOXCODE_KEY_EDITOR_FIELDS.Channel,
      editor.initialValues,
    )
    persisted.description = "Updated elsewhere"
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Renamed",
    })
    expect(result.facts?.displayName).toBe("Renamed")
    expect(persisted.description).toBe("Updated elsewhere")
    expect(
      calls.filter((path) => path.endsWith("api_endpoint_config")),
    ).toHaveLength(1)
    expect(
      calls.filter((path) => path.endsWith("model_square_config")),
    ).toHaveLength(1)
    expect(calls.filter((path) => path === "/api/keys")).toHaveLength(2)
    // Inventory refresh reads current keys without reloading session configuration.
    await collection.list()
    expect(
      calls.filter((path) => path.endsWith("api_endpoint_config")),
    ).toHaveLength(1)
  } finally {
    server.events.removeAllListeners("request:start")
  }
})

it("verifies identity again for independent operations using the same request", async () => {
  let identity = userId
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({ success: true, data: { user: { id: identity } } }),
    ),
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [key], pagination: { page: 1, pages: 1 } },
      }),
    ),
  )
  await fetchKeys(request)
  identity = "other-account"
  await expect(fetchKeys(request)).rejects.toMatchObject({
    code: "ACCOUNT_IDENTITY_MISMATCH",
  })
})

it("opens a fresh editor session from the accepted native row without reading the key inventory again", async () => {
  server.use(
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: { apiKeys: [key], pagination: { page: 1, pages: 1 } },
      }),
    ),
  )
  const input = {
    account: { id: "saved", siteType: "foxcode" as const },
    request: { ...request, accountId: "saved" },
  }
  const capability =
    getSiteTypeCapabilities("foxcode").account!.keyResourceManagement!
  const snapshot = (
    await (
      await (await capability.open(input)).openCollection("account")
    ).list()
  ).items[0]!
  const unnecessary = vi.fn(() => new HttpResponse(null, { status: 503 }))
  server.use(
    http.get(`${origin}/api/keys`, unnecessary),
    http.get(
      `${origin}/api/system-config/public/api_endpoint_config`,
      unnecessary,
    ),
  )
  const collection = await (
    await capability.open(input)
  ).openCollection("account")
  const editor = await collection.openEditEditor(snapshot.ref, undefined, {
    snapshot,
  })
  expect(editor.initialValues).toMatchObject({
    name: "Work",
    description: "Keep this",
    channelKey: "anthropic",
    quotaUsd: 0.01,
    enabled: true,
  })
  await editor.loadOptions!(
    FOXCODE_KEY_EDITOR_FIELDS.Channel,
    editor.initialValues,
  )
  server.use(
    http.patch(`${origin}/api/keys/${key.id}`, async ({ request }) => {
      expect(await request.json()).toEqual({
        name: "Renamed",
        quotaLimit: 50000,
      })
      return HttpResponse.json({ success: true, data: {} })
    }),
  )
  const result = await editor.submit({
    ...editor.initialValues,
    name: "Renamed",
    quotaUsd: 0.05,
  })
  const reopened = await (
    await (await capability.open(input)).openCollection("account")
  ).openEditEditor(result.facts!.ref, undefined, { snapshot: result.facts! })
  expect(reopened.initialValues).toMatchObject({
    name: "Renamed",
    description: "Keep this",
    quotaUsd: 0.05,
  })
  expect(unnecessary).not.toHaveBeenCalled()
})

it("reads native editor details when no retained record accompanies the row", async () => {
  const inventory = vi.fn(() =>
    HttpResponse.json({
      success: true,
      data: { apiKeys: [key], pagination: { page: 1, pages: 1 } },
    }),
  )
  server.use(http.get(`${origin}/api/keys`, inventory))
  const input = {
    account: { id: "saved", siteType: "foxcode" as const },
    request: { ...request, accountId: "saved" },
  }
  const capability =
    getSiteTypeCapabilities("foxcode").account!.keyResourceManagement!
  const original = (
    await (
      await (await capability.open(input)).openCollection("account")
    ).list()
  ).items[0]!
  // Reconstructed rows carry display facts but no complete native edit record.
  const snapshot = { ...original, ref: { ...original.ref } }
  const collection = await (
    await capability.open(input)
  ).openCollection("account")
  const editor = await collection.openEditEditor(snapshot.ref, undefined, {
    snapshot,
  })
  expect(editor.initialValues.description).toBe("Keep this")
  expect(inventory).toHaveBeenCalledTimes(2)
})

it("resolves native channel aliases to canonical runtime pricing groups while retaining edit values", async () => {
  server.use(
    http.get(`${origin}/api/system-config/public/model_square_config`, () =>
      HttpResponse.json({
        success: true,
        data: {
          config: {
            channels: [
              { ...config.channels[0], key: "official", aliases: ["legacy"] },
            ],
          },
        },
      }),
    ),
    http.get(`${origin}/api/keys`, () =>
      HttpResponse.json({
        success: true,
        data: {
          apiKeys: [{ ...key, channelKey: "legacy" }],
          pagination: { page: 1, pages: 1 },
        },
      }),
    ),
    http.patch(`${origin}/api/keys/key-one`, () =>
      HttpResponse.json({ success: true, data: {} }),
    ),
    http.get(`${origin}/api/model-pricing`, () =>
      HttpResponse.json({
        success: true,
        data: {
          pricing: { "claude-sonnet": { times: false, input: 3, output: 15 } },
        },
      }),
    ),
  )
  const capabilities = getSiteTypeCapabilities("foxcode").account!
  const session = await capabilities.keyResourceManagement!.open({
    account: { id: "saved", siteType: "foxcode" },
    request: { ...request, accountId: "saved" },
  })
  const collection = await session.openCollection("account")
  const facts = (await collection.list()).items[0]!
  const runtimeKey = buildAccountKeyResourceRuntimeKeyFromFacts(
    buildDisplaySiteData({ id: "saved", siteType: "foxcode" }),
    facts,
  )
  expect(runtimeKey.modelAccess.groups).toEqual(["official"])
  const editor = await collection.openEditEditor(facts.ref)
  expect(editor.initialValues.channelKey).toBe("legacy")
  const updated = await editor.submit({
    ...editor.initialValues,
    name: "Renamed",
  })
  expect(updated.facts?.runtimeKey?.modelAccess.groups).toEqual(["official"])
  const reopened = await collection.openEditEditor(updated.facts!.ref)
  expect(reopened.initialValues.channelKey).toBe("legacy")
  const pricing = await capabilities.modelCatalog!.enrichPricing!({
    accountRequest: request,
    runtimeKey,
    models: [{ id: "claude-sonnet" }],
  })
  expect(pricing.data[0]?.enable_groups).toEqual(["official"])
  expect(pricing.groupAccess).toMatchObject({ usableGroups: ["official"] })
  expect(pricing.groupRatios.official).toBe(8)
})
