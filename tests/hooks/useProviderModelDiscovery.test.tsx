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
})
