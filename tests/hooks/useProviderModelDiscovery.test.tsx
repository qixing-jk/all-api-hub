import { describe, expect, it, vi } from "vitest"

import { useProviderModelDiscovery } from "~/hooks/useProviderModelDiscovery"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

describe("useProviderModelDiscovery", () => {
  it("reloads changed source facts and ignores the superseded result", async () => {
    let resolveOld: ((modelIds: string[]) => void) | undefined
    let resolveNew: ((modelIds: string[]) => void) | undefined
    const oldModels = new Promise<string[]>((resolve) => {
      resolveOld = resolve
    })
    const newModels = new Promise<string[]>((resolve) => {
      resolveNew = resolve
    })
    const fetchModelIds = vi
      .fn()
      .mockReturnValueOnce(oldModels)
      .mockReturnValueOnce(newModels)

    const { result, rerender } = renderHook(
      ({ cacheKey, baseUrl, apiKey }) =>
        useProviderModelDiscovery({
          isOpen: true,
          sources: [
            {
              selectionId: "example-selection",
              cacheKey,
              baseUrl,
              resolveApiKey: async () => apiKey,
            },
          ],
          fetchModelIds,
        }),
      {
        initialProps: {
          cacheKey: "old-source",
          baseUrl: "https://old.example.invalid/v1",
          apiKey: "old-key",
        },
      },
    )

    await waitFor(() => expect(fetchModelIds).toHaveBeenCalledTimes(1))

    rerender({
      cacheKey: "new-source",
      baseUrl: "https://new.example.invalid/v1",
      apiKey: "new-key",
    })
    await waitFor(() => expect(fetchModelIds).toHaveBeenCalledTimes(2))
    expect(fetchModelIds).toHaveBeenLastCalledWith({
      baseUrl: "https://new.example.invalid",
      apiKey: "new-key",
    })

    await act(async () => {
      resolveOld?.(["old-model"])
      await oldModels
    })
    expect(result.current.getInventory("example-selection").modelIds).toEqual(
      [],
    )

    await act(async () => {
      resolveNew?.([" model-b ", "model-a", "model-b"])
      await newModels
    })
    await waitFor(() =>
      expect(result.current.getInventory("example-selection")).toMatchObject({
        status: "loaded",
        modelIds: ["model-a", "model-b"],
      }),
    )
  })

  it.each(["replace", "close", "unmount"])(
    "does not send a late credential after %s",
    async (action) => {
      let resolveKey!: (key: string) => void
      const pendingKey = new Promise<string>((resolve) => {
        resolveKey = resolve
      })
      const resolveApiKey = vi.fn().mockReturnValue(pendingKey)
      const fetchModelIds = vi.fn().mockResolvedValue(["model-a"])
      const { rerender, unmount } = renderHook(
        ({ isOpen, cacheKey }) =>
          useProviderModelDiscovery({
            isOpen,
            sources: [
              {
                selectionId: "account",
                cacheKey,
                baseUrl: "https://old.test",
                resolveApiKey:
                  cacheKey === "old" ? resolveApiKey : async () => "new-key",
              },
            ],
            fetchModelIds,
          }),
        { initialProps: { isOpen: true, cacheKey: "old" } },
      )
      await waitFor(() => expect(resolveApiKey).toHaveBeenCalled())
      if (action === "unmount") unmount()
      else
        rerender({
          isOpen: action !== "close",
          cacheKey: action === "replace" ? "new" : "old",
        })
      await act(async () => {
        resolveKey("old-key")
        await pendingKey
      })
      expect(fetchModelIds).not.toHaveBeenCalledWith({
        baseUrl: "https://old.test",
        apiKey: "old-key",
      })
      if (action === "replace")
        expect(fetchModelIds).toHaveBeenCalledWith({
          baseUrl: "https://old.test",
          apiKey: "new-key",
        })
    },
  )

  it("keeps the previous inventory on failure and recovers on retry", async () => {
    const fetchModelIds = vi
      .fn()
      .mockResolvedValueOnce(["model-a"])
      .mockRejectedValueOnce(new Error("upstream unavailable"))
      .mockResolvedValueOnce(["model-b"])
    const { result } = renderHook(() =>
      useProviderModelDiscovery({
        isOpen: true,
        sources: [
          {
            selectionId: "example-selection",
            cacheKey: "example-source",
            baseUrl: "https://api.example.invalid/v1",
            resolveApiKey: async () => "example-key",
          },
        ],
        fetchModelIds,
      }),
    )

    await waitFor(() =>
      expect(result.current.getInventory("example-selection")).toMatchObject({
        status: "loaded",
        modelIds: ["model-a"],
      }),
    )

    await act(async () => {
      await result.current.loadModels("example-selection")
    })
    expect(result.current.getInventory("example-selection")).toMatchObject({
      status: "error",
      modelIds: ["model-a"],
    })

    await act(async () => {
      await result.current.loadModels("example-selection")
    })
    expect(result.current.getInventory("example-selection")).toMatchObject({
      status: "loaded",
      modelIds: ["model-b"],
    })
  })

  it("clears inventory on close and ignores a late failure", async () => {
    let rejectModels: ((error: Error) => void) | undefined
    const models = new Promise<string[]>((_resolve, reject) => {
      rejectModels = reject
    })
    const fetchModelIds = vi.fn().mockReturnValue(models)
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        useProviderModelDiscovery({
          isOpen,
          sources: [
            {
              selectionId: "example-selection",
              cacheKey: "example-source",
              baseUrl: "https://api.example.invalid/v1",
              resolveApiKey: async () => "example-key",
            },
          ],
          fetchModelIds,
        }),
      { initialProps: { isOpen: true } },
    )

    await waitFor(() => expect(fetchModelIds).toHaveBeenCalledTimes(1))
    rerender({ isOpen: false })
    await waitFor(() =>
      expect(result.current.getInventory("example-selection")).toMatchObject({
        status: "idle",
        modelIds: [],
      }),
    )

    await act(async () => {
      rejectModels?.(new Error("late failure"))
      await expect(models).rejects.toThrow("late failure")
    })
    expect(result.current.getInventory("example-selection")).toMatchObject({
      status: "idle",
      modelIds: [],
    })
  })
})
