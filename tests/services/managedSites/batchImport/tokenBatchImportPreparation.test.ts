import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildServiceCredentialRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { fetchSiteUserGroups } from "~/services/apiService/newApiFamily/default/keyManagement"
import { prepareManagedSiteTokenBatchExportPreview } from "~/services/managedSites/batchImport/tokenBatchImportPreview"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: vi.fn(),
}))
vi.mock(
  "~/services/apiService/newApiFamily/default/keyManagement",
  async (original) => ({
    ...(await original<object>()),
    fetchSiteUserGroups: vi.fn(),
  }),
)
vi.mock("~/services/preferences/userPreferences", async (original) => ({
  ...(await original<object>()),
  userPreferences: {
    getPreferences: async () => ({
      newApi: {
        baseUrl: "https://new-api.invalid",
        adminToken: "admin-key",
        userId: "1",
      },
    }),
  },
}))
vi.mock(
  "~/services/managedSites/configuration/runtimeConfig",
  async (original) => ({
    ...(await original<object>()),
    getCurrentManagedSiteRuntimeConfig: async () => ({
      siteType: "new-api",
      config: {
        baseUrl: "https://new-api.invalid",
        adminToken: "admin-key",
        userId: "1",
      },
    }),
  }),
)

const account = buildDisplaySiteData({ baseUrl: "https://source.invalid" })
const item = {
  account,
  runtimeKey: buildServiceCredentialRuntimeKey(account, {
    kind: "singleton_service_key",
    service: "codex",
    label: "API key",
    key: "source-key",
    baseUrl: account.baseUrl,
    isAuthenticated: true,
  }),
}
const intent = {
  source: "repair-created",
  verification: "trusted-new",
} as const

describe("batch import preparation", () => {
  beforeEach(() => {
    vi.mocked(fetchOpenAICompatibleModelIds)
      .mockReset()
      .mockResolvedValue(["model"])
    vi.mocked(fetchSiteUserGroups).mockReset().mockResolvedValue(["vip"])
  })

  it("shows native import defaults without fetching unused group options", async () => {
    const preview = await prepareManagedSiteTokenBatchExportPreview({
      items: [item],
      intent,
    })
    expect(preview).toMatchObject({
      readyCount: 1,
      items: [{ draft: { groups: ["default"] } }],
    })
    expect(fetchSiteUserGroups).not.toHaveBeenCalled()
  })

  it("cancels active model reads and does not start the remaining preview rows", async () => {
    const signals: AbortSignal[] = []
    const finishes: Array<() => void> = []
    vi.mocked(fetchOpenAICompatibleModelIds).mockImplementation(
      ({ abortSignal }) => {
        if (!abortSignal)
          throw new Error("Missing upstream cancellation signal")
        signals.push(abortSignal)
        if (signals.length > 4) return Promise.resolve(["model"])
        return new Promise<string[]>((resolve, reject) => {
          finishes.push(() => resolve(["model"]))
          abortSignal.addEventListener(
            "abort",
            () => reject(abortSignal.reason),
            { once: true },
          )
        })
      },
    )
    const items = Array.from({ length: 9 }, (_, index) => ({
      ...item,
      runtimeKey: {
        ...item.runtimeKey,
        id: `key-${index}`,
        baseUrl: `https://source-${index}.invalid`,
        secret: `secret-${index}`,
      },
    }))
    const controller = new AbortController()
    const pending = prepareManagedSiteTokenBatchExportPreview({
      items,
      intent,
      signal: controller.signal,
    }).then(
      () => null,
      (error: unknown) => error,
    )
    await vi.waitFor(() => expect(signals).toHaveLength(4))
    controller.abort()
    try {
      expect(signals.every((signal) => signal.aborted)).toBe(true)
    } finally {
      finishes.forEach((finish) => finish())
      await pending
    }
    expect(await pending).toMatchObject({ name: "AbortError" })
    expect(fetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(4)
  })

  it("does not fetch models for an already cancelled preview", async () => {
    const signal = AbortSignal.abort()
    await expect(
      prepareManagedSiteTokenBatchExportPreview({
        items: [item],
        intent,
        signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchOpenAICompatibleModelIds).not.toHaveBeenCalled()
    expect(fetchSiteUserGroups).not.toHaveBeenCalled()
  })
})
