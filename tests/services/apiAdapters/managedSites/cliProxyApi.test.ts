import { beforeEach, describe, expect, it, vi } from "vitest"

import { cliProxyApiRef } from "~/services/apiAdapters/managedResources/cliProxyApi"
import { cliProxyApiCapabilities } from "~/services/apiAdapters/managedSites/cliProxyApi"
import type { CliProxyApiResource } from "~/services/apiService/cliProxyApi"
import { API_TYPES } from "~/services/verification/aiApiVerification"

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
