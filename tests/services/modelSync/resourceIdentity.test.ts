import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { ModelSyncService } from "~/services/models/modelSync/modelSyncService"
import type { ManagedModelChannel } from "~/types/managedResourceModels"

const { list, fetchModels, updateModels } = vi.hoisted(() => ({
  list: vi.fn(),
  fetchModels: vi.fn(),
  updateModels: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: () => ({
    managedSites: {
      models: {
        list,
        fetchModels,
        updateModels,
        updateModelMapping: vi.fn(),
      },
    },
  }),
}))

const runtimeConfig = {
  siteType: SITE_TYPES.NEW_API,
  config: {
    baseUrl: "https://managed.example",
    adminToken: "test-admin-token",
    userId: "1",
  },
} as const

const ref: ManagedResourceRef = {
  siteType: SITE_TYPES.NEW_API,
  kind: "channel",
  scopeKey: "https://managed.example",
  resourceId: "provider:alpha/key-01",
}

const makeChannel = (): ManagedModelChannel => ({
  ref,
  name: "Alpha",
  type: "openai-compatible",
  baseUrl: "https://upstream.example",
  models: ["old-model"],
  disabled: false,
  modelMapping: "",
})

describe("managed model resource identity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ items: [makeChannel()], total: 1 })
    fetchModels.mockResolvedValue(["new-model"])
    updateModels.mockResolvedValue({
      outcome: "succeeded",
      data: undefined,
      confirmedEffects: [],
    })
  })

  it("preserves an opaque resource reference through model reads, writes and results", async () => {
    const service = new ModelSyncService(runtimeConfig)

    const result = await service.runForChannel(makeChannel(), 0)

    expect(fetchModels).toHaveBeenCalledWith(
      runtimeConfig.config,
      ref,
      undefined,
    )
    expect(updateModels).toHaveBeenCalledWith(
      runtimeConfig.config,
      ref,
      ["new-model"],
      undefined,
    )
    expect(result).toMatchObject({
      resourceRef: ref,
      ok: true,
      oldModels: ["old-model"],
      newModels: ["new-model"],
    })
  })

  it.each([
    { ...ref, siteType: SITE_TYPES.VELOERA },
    { ...ref, scopeKey: "https://another-deployment.example" },
  ])(
    "rejects a resource from another site or deployment before provider access",
    async (foreignRef) => {
      const service = new ModelSyncService(runtimeConfig)

      await expect(
        service.runForChannel({ ...makeChannel(), ref: foreignRef }, 0),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(fetchModels).not.toHaveBeenCalled()
      expect(updateModels).not.toHaveBeenCalled()
    },
  )

  it("rejects a mixed-scope batch before starting any channel", async () => {
    const service = new ModelSyncService(runtimeConfig)

    await expect(
      service.runBatch(
        [
          makeChannel(),
          {
            ...makeChannel(),
            ref: { ...ref, scopeKey: "https://other.example" },
          },
        ],
        { concurrency: 2, maxRetries: 0 },
      ),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(fetchModels).not.toHaveBeenCalled()
    expect(updateModels).not.toHaveBeenCalled()
  })

  it("rejects inventory references outside the bound deployment", async () => {
    list.mockResolvedValue({
      items: [
        {
          ...makeChannel(),
          ref: { ...ref, scopeKey: "https://other.example" },
        },
      ],
      total: 1,
    })

    await expect(
      new ModelSyncService(runtimeConfig).listChannels(),
    ).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    expect(fetchModels).not.toHaveBeenCalled()
    expect(updateModels).not.toHaveBeenCalled()
  })
})
