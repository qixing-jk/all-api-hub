import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildServiceCredentialRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { magpieManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/magpie"
import {
  listMagpieProviders,
  readMagpieProviderKey,
} from "~/services/apiService/magpie/providers"
import { prepareManagedSiteTokenBatchExportPreview } from "~/services/managedSites/batchImport/tokenBatchImportPreview"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/magpie/providers", async (original) => ({
  ...(await original<object>()),
  listMagpieProviders: vi.fn(),
  readMagpieProviderKey: vi.fn(),
}))
vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: vi.fn(),
}))
vi.mock(
  "~/services/managedSites/configuration/runtimeConfig",
  async (original) => ({
    ...(await original<object>()),
    getCurrentManagedSiteRuntimeConfig: async () => ({
      siteType: "magpie",
      config: { baseUrl: "https://magpie.invalid", webKey: "test-web-key" },
    }),
  }),
)
vi.mock("~/services/apiAdapters/registry", async (original) => ({
  ...(await original<object>()),
  getManagedSiteCapabilities: () => magpieManagedSiteCapabilities,
}))

const items = Array.from({ length: 9 }, (_, index) => {
  const account = buildDisplaySiteData({
    id: `account-${index}`,
    baseUrl: `https://source-${index}.invalid`,
  })
  return {
    account,
    runtimeKey: buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "API key",
      key: `secret-${index}`,
      baseUrl: account.baseUrl,
      isAuthenticated: true,
    }),
  }
})

describe("batch import inventory reads", () => {
  beforeEach(() => {
    vi.mocked(listMagpieProviders).mockReset().mockResolvedValue([])
    vi.mocked(readMagpieProviderKey).mockReset()
    vi.mocked(fetchOpenAICompatibleModelIds)
      .mockReset()
      .mockResolvedValue(["model"])
  })

  it("does not retry a failed secret in the same row's two matching phases but retries a new preview", async () => {
    vi.mocked(listMagpieProviders).mockResolvedValue([
      {
        id: "existing",
        name: "Existing",
        chat: "https://source-0.invalid/v1",
        responses: "",
        anthropic: "",
        key: { set: true, masked: "***", optional: false },
        chosen: [],
        models: [],
        off: false,
      },
    ])
    vi.mocked(readMagpieProviderKey).mockRejectedValue(new Error("offline"))
    const protectionBypassExecution = {
      version: 2 as const,
      kind: "automatic" as const,
      feature: "managed_site_channels" as const,
      trigger: "background_recovery" as const,
      surface: "background" as const,
    }
    const params = { items: [items[0]!], protectionBypassExecution }
    const preview = await prepareManagedSiteTokenBatchExportPreview(params)
    expect(preview).toMatchObject({ readyCount: 0, warningCount: 1 })
    expect(readMagpieProviderKey).toHaveBeenCalledOnce()
    await prepareManagedSiteTokenBatchExportPreview(params)
    expect(readMagpieProviderKey).toHaveBeenCalledTimes(2)
  })

  it("previews distinct sources with one inventory read across worker waves and refreshes the next batch", async () => {
    const preview = await prepareManagedSiteTokenBatchExportPreview({ items })
    expect(preview).toMatchObject({ totalCount: 9, readyCount: 9 })
    expect(new Set(preview.items.map((item) => item.draft?.key)).size).toBe(9)
    expect(listMagpieProviders).toHaveBeenCalledTimes(1)

    await prepareManagedSiteTokenBatchExportPreview({ items })
    expect(listMagpieProviders).toHaveBeenCalledTimes(2)
    // Different keys still require their own model permission checks.
    expect(fetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(18)
  })

  it("skips a verified Magpie provider without requesting upstream models", async () => {
    vi.mocked(listMagpieProviders).mockResolvedValue([
      {
        id: "existing",
        name: "Existing",
        chat: "https://source-0.invalid/v1",
        responses: "",
        anthropic: "",
        key: { set: true, masked: "***", optional: false },
        chosen: [],
        models: [],
        off: false,
      },
    ])
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("models offline"),
    )
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [items[0]!],
      resolvedChannelKeysByItemId: {
        [items[0]!.runtimeKey.id]: {
          [getManagedResourceRefKey({
            siteType: "magpie",
            kind: "channel",
            scopeKey: "https://magpie.invalid",
            resourceId: "existing",
          })]: "secret-0",
        },
      },
    })
    expect(preview).toMatchObject({ skippedCount: 1, blockedCount: 0 })
    expect(fetchOpenAICompatibleModelIds).not.toHaveBeenCalled()
  })

  it("does not retain a failed inventory read for later worker waves", async () => {
    vi.mocked(listMagpieProviders).mockRejectedValueOnce(new Error("offline"))
    const preview = await prepareManagedSiteTokenBatchExportPreview({ items })
    expect(preview).toMatchObject({
      totalCount: 9,
      readyCount: 5,
      blockedCount: 4,
    })
    expect(listMagpieProviders).toHaveBeenCalledTimes(2)
  })

  it("cancels the shared inventory read when its preview is cancelled", async () => {
    let upstreamSignal: AbortSignal | undefined
    let finish!: () => void
    vi.mocked(listMagpieProviders).mockImplementation(
      (_config, options) =>
        new Promise((resolve, reject) => {
          upstreamSignal = options?.signal
          finish = () => resolve([])
          upstreamSignal?.addEventListener(
            "abort",
            () => reject(upstreamSignal?.reason),
            { once: true },
          )
        }),
    )
    const controller = new AbortController()
    const pending = prepareManagedSiteTokenBatchExportPreview({
      items,
      signal: controller.signal,
    }).then(
      () => null,
      (error: unknown) => error,
    )
    await vi.waitFor(() => expect(listMagpieProviders).toHaveBeenCalledTimes(1))
    controller.abort()
    try {
      expect(upstreamSignal?.aborted).toBe(true)
    } finally {
      finish()
      await pending
    }
    expect(await pending).toMatchObject({ name: "AbortError" })
    expect(listMagpieProviders).toHaveBeenCalledTimes(1)
    expect(fetchOpenAICompatibleModelIds).not.toHaveBeenCalled()
  })

  it("starts a fresh inventory read for an overlapping preview", async () => {
    let finish!: (providers: []) => void
    const pending = new Promise<[]>((resolve) => {
      finish = resolve
    })
    vi.mocked(listMagpieProviders).mockImplementation(() => pending)
    const first = prepareManagedSiteTokenBatchExportPreview({ items })
    const second = prepareManagedSiteTokenBatchExportPreview({ items })
    try {
      await vi.waitFor(() =>
        expect(listMagpieProviders).toHaveBeenCalledTimes(2),
      )
    } finally {
      finish([])
      await Promise.all([first, second])
    }
  })

  it("filters one inventory independently for each source and observes new providers in the next preview", async () => {
    const provider = {
      id: "provider-0",
      name: "Source 0",
      chat: "https://source-0.invalid/v1",
      responses: "",
      anthropic: "",
      key: { set: true, masked: "***", optional: false },
      chosen: ["model"],
      models: [],
      off: false,
    }
    vi.mocked(listMagpieProviders).mockResolvedValue([provider])
    const first = await prepareManagedSiteTokenBatchExportPreview({ items })
    expect(first.items[0]?.assessment?.url.matched).toBe(true)
    expect(first.items[1]?.assessment?.url.matched).toBe(false)

    vi.mocked(listMagpieProviders).mockResolvedValue([
      { ...provider, id: "provider-1", chat: "https://source-1.invalid/v1" },
    ])
    const second = await prepareManagedSiteTokenBatchExportPreview({ items })
    expect(second.items[0]?.assessment?.url.matched).toBe(false)
    expect(second.items[1]?.assessment?.url.matched).toBe(true)
    expect(listMagpieProviders).toHaveBeenCalledTimes(2)
  })
})
