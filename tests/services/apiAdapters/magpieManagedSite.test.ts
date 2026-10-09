import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { magpieManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/magpie"
import {
  discoverMagpieModels,
  listMagpieProviders,
  readMagpieProviderKey,
  saveMagpieProvider,
} from "~/services/apiService/magpie/providers"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/matching/channelMatchResolver"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import { ModelSyncService } from "~/services/models/modelSync/modelSyncService"
import type { MagpieConfig } from "~/types/magpieConfig"

vi.mock("~/services/apiService/magpie/providers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listMagpieProviders: vi.fn(),
  discoverMagpieModels: vi.fn(),
  readMagpieProviderKey: vi.fn(),
  saveMagpieProvider: vi.fn(),
}))
vi.mock("~/services/managedSites/utils/fetchManagedSiteImportModels", () => ({
  fetchManagedSiteImportModels: vi.fn(),
}))
const config = { baseUrl: "http://magpie.test:3430", webKey: "test-web-key" }
const capability: ManagedSiteCapabilities<MagpieConfig> =
  magpieManagedSiteCapabilities

beforeEach(() => vi.clearAllMocks())

describe("Magpie provider import", () => {
  it.each([
    ["chat", "https://relay.test/proxy/v1", "https://relay.test/proxy"],
    [
      "responses",
      "https://relay.test/proxy/v1",
      "https://relay.test/proxy/v1/responses",
    ],
    [
      "anthropic",
      "https://relay.test/proxy",
      "https://relay.test/proxy/v1/messages",
    ],
    ["gemini", "https://relay.test/proxy/v1beta", "https://relay.test/proxy"],
    ["gemini", "https://relay.test/proxy", "https://relay.test/proxy/v1beta"],
  ])(
    "locates %s providers through the complete URL and key resolver",
    async (type, endpoint, accountBaseUrl) => {
      vi.mocked(listMagpieProviders).mockResolvedValue([
        {
          id: "native/42+=",
          name: "Friendly provider",
          chat: "",
          responses: "",
          anthropic: "",
          [type]: endpoint,
          key: { set: true, masked: "sk-***", optional: false },
          chosen: ["m1"],
          models: [],
          off: false,
        },
      ])
      vi.mocked(readMagpieProviderKey).mockResolvedValue("sk-test")
      const result = await resolveManagedSiteChannelMatch({
        managedSite: capability,
        managedConfig: config,
        accountBaseUrl,
        models: ["m1"],
        key: "sk-test",
        resolveHiddenKeys: true,
        protectionBypassExecution: {
          version: 2,
          kind: "automatic",
          feature: "managed_site_channels",
          trigger: "background_recovery",
          surface: "background",
        },
      })
      expect(result.url).toMatchObject({
        matched: true,
        channel: { ref: { resourceId: "native/42+=" } },
      })
      expect(result.key).toMatchObject({
        matched: true,
        channel: { ref: { resourceId: "native/42+=" } },
      })
    },
  )

  it("leaves providers with automatic catalogs under native model management", async () => {
    vi.mocked(listMagpieProviders).mockResolvedValue([
      {
        id: "automatic",
        name: "Automatic",
        chat: "https://relay.test/v1",
        responses: "",
        anthropic: "",
        key: { set: true, masked: "sk-***", optional: false },
        chosen: [],
        models: [{ id: "m1", on: true }],
        off: false,
      },
    ])
    const service = new ModelSyncService({ siteType: "magpie", config })
    expect(await service.listChannels()).toEqual({ items: [], total: 0 })
    expect(saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("runs model sync without requiring an unrelated model-alias capability", async () => {
    const provider = {
      id: "relay",
      name: "Relay",
      chat: "https://relay.test/v1",
      responses: "",
      anthropic: "",
      key: { set: true, masked: "sk-***", optional: false },
      chosen: ["m1"],
      models: [{ id: "m1", on: true }],
      off: false,
      headers: { "X-Native": "keep" },
    }
    vi.mocked(listMagpieProviders).mockResolvedValue([provider])
    vi.mocked(readMagpieProviderKey).mockResolvedValue("sk-test")
    vi.mocked(discoverMagpieModels).mockResolvedValue(["m1", "m2"])
    vi.mocked(saveMagpieProvider).mockResolvedValue([
      { ...provider, chosen: ["m1", "m2"] },
    ])
    const service = new ModelSyncService({ siteType: "magpie", config })
    const channel = (await service.listChannels()).items[0]!
    expect(await service.runForChannel(channel, 0)).toMatchObject({
      ok: true,
      newModels: ["m1", "m2"],
    })
    expect(discoverMagpieModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ headers: provider.headers, key: "sk-test" }),
      undefined,
    )
    const payload = vi.mocked(saveMagpieProvider).mock.calls[0]![1]
    expect(payload).toMatchObject({
      models: ["m1", "m2"],
      headers: provider.headers,
    })
    expect(payload).not.toHaveProperty("key")
    await expect(
      service.updateChannelModelMapping(channel, { alias: "m1" }),
    ).rejects.toThrow(/mapping.*not implemented/)
  })

  it.each([false, true])(
    "refuses a sync write after the provider returns to its automatic catalog (between reads=%s)",
    async (betweenReads) => {
      const provider = {
        id: "relay",
        name: "Relay",
        chat: "https://relay.test/v1",
        responses: "",
        anthropic: "",
        key: { set: true, masked: "sk-***", optional: false },
        chosen: [],
        models: [{ id: "m1", on: true }],
        off: false,
      }
      vi.mocked(listMagpieProviders).mockResolvedValue([provider])
      if (betweenReads)
        vi.mocked(listMagpieProviders).mockResolvedValueOnce([
          { ...provider, chosen: ["m1"] },
        ])
      await expect(
        capability.models!.updateModels!(
          config,
          {
            siteType: "magpie",
            kind: "channel",
            scopeKey: config.baseUrl,
            resourceId: "relay",
          },
          ["m1", "m2"],
        ),
      ).rejects.toMatchObject({
        failure: { code: "resource_changed" },
      })
      expect(saveMagpieProvider).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      "openai-compatible",
      "chat",
      "https://relay.test/api/v3",
      "https://relay.test/api/v3",
    ],
    [
      "openai",
      "responses",
      "https://relay.test/v1/responses",
      "https://relay.test/v1",
    ],
    [
      "anthropic",
      "anthropic",
      "https://relay.test/v1/messages",
      "https://relay.test",
    ],
    [
      "google",
      "gemini",
      "https://relay.test/v1beta",
      "https://relay.test/v1beta",
    ],
    [
      "google",
      "gemini",
      "https://relay.test/proxy",
      "https://relay.test/proxy/v1beta",
    ],
    [
      "google",
      "gemini",
      "https://relay.test/proxy/v1beta/models",
      "https://relay.test/proxy/v1beta",
    ],
  ] as const)(
    "keeps the %s source on its native endpoint",
    async (apiType, type, baseUrl, expected) => {
      vi.mocked(fetchManagedSiteImportModels).mockResolvedValue({
        models: ["m1"],
        fetchFailed: false,
      })
      expect(
        await capability.channelDrafts.prepareFormData({
          name: "Source",
          baseUrl,
          apiKey: "sk-test",
          apiType,
          modelHints: ["m1"],
        }),
      ).toMatchObject({
        type,
        base_url: expected,
        models: ["m1"],
        key: "sk-test",
      })
    },
  )

  it("matches Gemini roots without conflating a longer unrelated path or revealing keys", async () => {
    vi.mocked(listMagpieProviders).mockResolvedValue([
      {
        id: "gemini",
        name: "Gemini",
        chat: "",
        responses: "",
        anthropic: "",
        gemini: "https://relay.test",
        key: { set: true, masked: "secret-mask", optional: false },
        chosen: [],
        models: [],
        off: false,
      },
    ])
    expect(
      await capability.matching.search(config, "https://relay.test/v1beta"),
    ).toMatchObject({ total: 1, items: [{ type: "gemini", key: "" }] })
    expect(
      await capability.matching.search(
        config,
        "https://relay.test/other/v1beta",
      ),
    ).toMatchObject({ total: 0 })
  })

  it("exposes native model discovery and model-only writes through the existing workflow", () => {
    expect(capability.models?.fetchModels).toBeTypeOf("function")
    expect(capability.models?.fetchDraftModels).toBeTypeOf("function")
    expect(capability.models?.updateModels).toBeTypeOf("function")
  })
})
