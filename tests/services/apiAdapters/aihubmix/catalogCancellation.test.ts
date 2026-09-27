import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAccountAvailableModels,
  fetchAllModels,
  fetchModelPricing,
  invalidateAIHubMixPublicCatalogs,
} from "~/services/apiAdapters/aihubmix/catalog"
import { AuthTypeEnum } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"

const native = vi.hoisted(() => ({
  fetchAIHubMixApiUserModelIds: vi.fn(),
  fetchAIHubMixWebUserModelIds: vi.fn(),
  fetchAIHubMixModelCatalog: vi.fn(),
  fetchAIHubMixWebsiteModels: vi.fn(),
}))
vi.mock("~/services/apiService/aihubmix/modelCatalog", () => native)

const request = {
  baseUrl: "https://aihubmix.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "account-token" },
}

describe("AIHubMix catalog cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    invalidateAIHubMixPublicCatalogs()
    native.fetchAIHubMixApiUserModelIds.mockResolvedValue(["model-a"])
    native.fetchAIHubMixModelCatalog.mockResolvedValue([
      { model_id: "model-a" },
    ])
    native.fetchAIHubMixWebsiteModels.mockResolvedValue(new Map())
  })

  it.each([fetchModelPricing, fetchAccountAvailableModels, fetchAllModels])(
    "does not start native sources for a cancelled %s request",
    async (load) => {
      const controller = new AbortController()
      const reason = new DOMException("Cancelled", "AbortError")
      controller.abort(reason)
      await expect(
        load({ ...request, abortSignal: controller.signal }),
      ).rejects.toBe(reason)
      for (const fetch of Object.values(native))
        expect(fetch).not.toHaveBeenCalled()
    },
  )

  it("propagates user-model cancellation instead of trying web or public fallback", async () => {
    const reason = new DOMException("Cancelled", "AbortError")
    native.fetchAIHubMixApiUserModelIds.mockRejectedValue(reason)
    await expect(fetchAccountAvailableModels(request)).rejects.toBe(reason)
    expect(native.fetchAIHubMixWebUserModelIds).not.toHaveBeenCalled()
    expect(native.fetchAIHubMixModelCatalog).not.toHaveBeenCalled()
  })

  it("cancels one waiter promptly while another still uses the shared public catalog", async () => {
    const publicCatalog = createDeferred<Array<{ model_id: string }>>()
    native.fetchAIHubMixModelCatalog.mockReturnValue(publicCatalog.promise)
    const controller = new AbortController()
    const reason = new DOMException("Cancelled", "AbortError")
    let observed: unknown
    const cancelled = fetchModelPricing({
      ...request,
      abortSignal: controller.signal,
    }).then(
      (value) => {
        observed = value
      },
      (error) => {
        observed = error
      },
    )
    const continuing = fetchModelPricing(request)
    try {
      await vi.waitFor(() =>
        expect(native.fetchAIHubMixApiUserModelIds).toHaveBeenCalledTimes(2),
      )
      controller.abort(reason)
      await vi.waitFor(() => expect(observed).toBe(reason))
    } finally {
      publicCatalog.resolve([{ model_id: "model-a" }])
      await cancelled
    }
    await expect(continuing).resolves.toMatchObject({
      data: [{ model_name: "model-a" }],
    })
    expect(native.fetchAIHubMixModelCatalog).toHaveBeenCalledTimes(1)
  })
})
