import { beforeEach, describe, expect, it, vi } from "vitest"

import { cliProxyApiRef } from "~/services/apiAdapters/managedResources/cliProxyApi"
import { cliProxyApiCapabilities } from "~/services/apiAdapters/managedSites/cliProxyApi"
import type { CliProxyApiResource } from "~/services/apiService/cliProxyApi"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { createDeferred } from "~~/tests/test-utils/deferred"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  runtime: vi.fn(),
  resource: vi.fn(),
}))
vi.mock("~/services/apiService/cliProxyApi", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/apiService/cliProxyApi")
  >()),
  listAllCliProxyApiProviders: mocks.list,
}))
vi.mock("~/services/managedSites/runtimeConfig", () => ({
  getManagedSiteRuntimeConfigForType: mocks.runtime,
}))
vi.mock(
  "~/services/apiAdapters/managedResources/cliProxyApi",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiAdapters/managedResources/cliProxyApi")
    >()),
    getCliProxyApiResource: mocks.resource,
  }),
)

const config = {
  baseUrl: "https://management.example/proxy",
  adminToken: "admin-key",
}
const resource: CliProxyApiResource = {
  id: "provider",
  kind: "openai-compatibility",
  value: {
    name: "Provider",
    "base-url": "https://upstream.example/v1",
    "api-key-entries": [{ "api-key": "key-one" }, { "api-key": "key-two" }],
    models: [{ name: "original", alias: "alias" }, { name: "plain" }],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue([resource])
  mocks.runtime.mockResolvedValue({ config })
  mocks.resource.mockResolvedValue(resource)
})

describe("CLIProxyAPI configuration and credential matching", () => {
  it("shares equivalent configs but isolates credentials and deployment paths", async () => {
    const inventory = createDeferred<CliProxyApiResource[]>()
    mocks.list.mockReturnValue(inventory.promise)
    const search = cliProxyApiCapabilities.matching.search
    const requests = [
      search(config, "first.example"),
      search(
        { adminToken: config.adminToken, baseUrl: config.baseUrl },
        "second.example",
      ),
      search({ ...config, adminToken: "other-admin" }, "first.example"),
      search(
        { ...config, baseUrl: `${config.baseUrl}/other` },
        "first.example",
      ),
    ]
    expect(mocks.list).toHaveBeenCalledTimes(3)
    inventory.resolve([])
    await expect(Promise.all(requests)).resolves.toEqual(
      Array.from({ length: 4 }, () => ({
        items: [],
        total: 0,
        type_counts: {},
      })),
    )
  })

  it("replaces an orphaned read without a late response evicting its replacement", async () => {
    const oldInventory = createDeferred<CliProxyApiResource[]>()
    const newInventory = createDeferred<CliProxyApiResource[]>()
    mocks.list
      .mockReturnValueOnce(oldInventory.promise)
      .mockReturnValueOnce(newInventory.promise)
    const controller = new AbortController()
    const firstOutcome = Promise.allSettled([
      cliProxyApiCapabilities.matching.search(config, "first.example", {
        signal: controller.signal,
      }),
    ])
    const readSignal = mocks.list.mock.calls[0][1].signal as AbortSignal
    controller.abort()
    expect(readSignal.aborted).toBe(true)
    expect(await firstOutcome).toEqual([
      {
        status: "rejected",
        reason: expect.objectContaining({ name: "AbortError" }),
      },
    ])
    const replacement = cliProxyApiCapabilities.matching.search(
      config,
      "first.example",
    )
    oldInventory.resolve([])
    await oldInventory.promise
    const joined = cliProxyApiCapabilities.matching.search(
      config,
      "second.example",
    )
    expect(mocks.list).toHaveBeenCalledTimes(2)
    newInventory.resolve([])
    await Promise.all([replacement, joined])
  })

  it("does not dispatch canceled consumers and retries failed inventory reads", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      cliProxyApiCapabilities.matching.search(config, "", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(mocks.list).not.toHaveBeenCalled()
    mocks.list.mockRejectedValueOnce(new Error("temporarily unavailable"))
    await expect(
      cliProxyApiCapabilities.matching.search(config, ""),
    ).rejects.toThrow("temporarily unavailable")
    mocks.list.mockResolvedValueOnce([])
    await expect(
      cliProxyApiCapabilities.matching.search(config, ""),
    ).resolves.toMatchObject({ items: [], total: 0 })
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it("shares pending inventories across search URLs without canceling another consumer", async () => {
    const inventory = createDeferred<CliProxyApiResource[]>()
    mocks.list.mockReturnValueOnce(inventory.promise)
    const controller = new AbortController()
    const first = cliProxyApiCapabilities.matching.search(
      config,
      "upstream.example",
      {
        signal: controller.signal,
        requestScheduling: { priority: "background" },
      },
    )
    const firstOutcome = Promise.allSettled([first])
    const second = cliProxyApiCapabilities.matching.search(
      config,
      "other.example",
    )
    controller.abort()
    const readOptions = mocks.list.mock.calls[0][1]
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(readOptions.signal.aborted).toBe(false)
    expect(readOptions.requestScheduling.priority).toBe("foreground")
    inventory.resolve([
      resource,
      {
        id: "other",
        kind: "codex-api-key",
        value: { "base-url": "https://other.example", "api-key": "other-key" },
      },
    ])
    expect(await firstOutcome).toEqual([
      {
        status: "rejected",
        reason: expect.objectContaining({ name: "AbortError" }),
      },
    ])
    await expect(second).resolves.toMatchObject({
      total: 1,
      items: [{ base_url: "https://other.example", key: "other-key" }],
    })

    // A later import must see any edits made after the shared read completed.
    mocks.list.mockResolvedValueOnce([])
    await expect(
      cliProxyApiCapabilities.matching.search(config, "other.example"),
    ).resolves.toMatchObject({ total: 0, items: [] })
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it("validates configuration using an authenticated inventory read", async () => {
    expect(await cliProxyApiCapabilities.config.checkValid()).toBe(true)
    expect(mocks.list).toHaveBeenCalledWith(config)
    mocks.list.mockRejectedValueOnce(new Error("unauthorized"))
    expect(await cliProxyApiCapabilities.config.checkValid()).toBe(false)
    mocks.runtime.mockResolvedValueOnce(null)
    mocks.list.mockClear()
    expect(await cliProxyApiCapabilities.config.checkValid()).toBe(false)
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it("matches every OpenAI credential and exposes model aliases without unrelated providers", async () => {
    mocks.list.mockResolvedValueOnce([
      resource,
      {
        id: "other",
        kind: "codex-api-key",
        value: { "base-url": "https://other.example", "api-key": "other-key" },
      },
    ])
    const result = await cliProxyApiCapabilities.matching.search(
      config,
      "upstream.example",
    )
    expect(result).toEqual({
      items: ["key-one", "key-two"].map((key) => ({
        ref: cliProxyApiRef(config, resource),
        name: "Provider",
        type: "openai-compatibility",
        base_url: "https://upstream.example/v1",
        models: "alias,plain",
        key,
      })),
      total: 2,
      type_counts: {},
    })
  })
  it("supports unnamed native providers without models or a base URL", async () => {
    const native: CliProxyApiResource = {
      id: "native",
      kind: "claude-api-key",
      value: { "api-key": "native-key" },
    }
    mocks.list.mockResolvedValueOnce([native])
    expect(
      await cliProxyApiCapabilities.matching.search(config, ""),
    ).toMatchObject({
      total: 1,
      items: [
        { name: "claude-api-key", key: "native-key", models: "", base_url: "" },
      ],
    })
    mocks.resource.mockResolvedValueOnce(native)
    expect(
      await cliProxyApiCapabilities.matching.fetchSecretKey(
        config,
        cliProxyApiRef(config, native),
      ),
    ).toBe("native-key")
  })
  it("rejects ambiguous secret access and references belonging to another deployment", async () => {
    const ref = cliProxyApiRef(config, resource)
    await expect(
      cliProxyApiCapabilities.matching.fetchSecretKey(config, ref),
    ).rejects.toThrow("Multiple provider credentials")
    mocks.resource.mockClear()
    await expect(
      cliProxyApiCapabilities.matching.fetchSecretKey(config, {
        ...ref,
        scopeKey: "https://another.example",
      }),
    ).rejects.toThrow("Invalid resource reference")
    expect(mocks.resource).not.toHaveBeenCalled()
  })
})

vi.mock("~/services/managedSites/utils/fetchManagedSiteImportModels", () => ({
  fetchManagedSiteImportModels: async () => ({
    models: ["test-model"],
    fetchFailed: false,
  }),
}))

describe("CLIProxyAPI managed-site import", () => {
  it.each([
    [
      API_TYPES.OPENAI_COMPATIBLE,
      "https://gateway.example/prefix",
      "openai-compatibility",
      "https://gateway.example/prefix/v1",
    ],
    [
      API_TYPES.OPENAI_COMPATIBLE,
      "https://gateway.example/v1/chat/completions",
      "openai-compatibility",
      "https://gateway.example/v1",
    ],
    [
      API_TYPES.OPENAI,
      "https://api.openai.com/v1/responses",
      "codex-api-key",
      "https://api.openai.com/v1",
    ],
    [
      API_TYPES.OPENAI,
      "https://chatgpt.com/backend-api/codex/responses",
      "codex-api-key",
      "https://chatgpt.com/backend-api/codex",
    ],
    [
      API_TYPES.ANTHROPIC,
      "https://gateway.example/prefix/v1/messages",
      "claude-api-key",
      "https://gateway.example/prefix",
    ],
    [
      API_TYPES.GOOGLE,
      "https://gateway.example/v1beta",
      "gemini-api-key",
      "https://gateway.example",
    ],
  ] as const)(
    "prepares %s at %s for its native executor",
    async (apiType, baseUrl, kind, expectedUrl) => {
      const draft = await cliProxyApiCapabilities.channelDrafts.prepareFormData(
        {
          name: "Imported",
          apiKey: "source-key",
          baseUrl,
          apiType,
          modelHints: ["hint"],
        },
      )
      expect(draft).toMatchObject({
        name: "Imported",
        key: "source-key",
        type: kind,
        base_url: expectedUrl,
        enabled: true,
      })
      expect(draft.models).toEqual(
        kind === "openai-compatibility" || kind === "codex-api-key"
          ? ["test-model"]
          : ["hint"],
      )
    },
  )
})
