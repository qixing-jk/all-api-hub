import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"

const { fetchOpenAICompatibleModelIdsMock } = vi.hoisted(() => ({
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))

describe("fetchTokenScopedModels", () => {
  beforeEach(() => {
    fetchOpenAICompatibleModelIdsMock.mockReset()
  })

  it("normalizes the fetched upstream model list for the selected token", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      " gpt-4o ",
      "",
      "gpt-4o",
      "gpt-4.1",
    ])

    await expect(
      fetchTokenScopedModels(
        { baseUrl: "https://example.com" } as any,
        { key: "sk-token" } as any,
      ),
    ).resolves.toEqual({
      models: ["gpt-4o", "gpt-4.1"],
      fetchFailed: false,
    })

    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      apiKey: "sk-token",
    })
  })

  it("returns a structured fetch failure when the upstream lookup throws", async () => {
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(new Error("boom"))

    await expect(
      fetchTokenScopedModels(
        { baseUrl: "https://example.com" } as any,
        { key: "sk-token" } as any,
      ),
    ).resolves.toEqual({
      models: [],
      fetchFailed: true,
    })
  })

  it("treats a nullish upstream response as an empty successful model list", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(undefined)

    await expect(
      fetchTokenScopedModels(
        { baseUrl: "https://example.com" } as any,
        { key: "sk-token" } as any,
      ),
    ).resolves.toEqual({
      models: [],
      fetchFailed: false,
    })
  })
})
