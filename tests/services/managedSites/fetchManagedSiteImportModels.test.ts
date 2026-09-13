import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"

const { fetchOpenAICompatibleModelIdsMock } = vi.hoisted(() => ({
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))

describe("fetchManagedSiteImportModels", () => {
  beforeEach(() => {
    fetchOpenAICompatibleModelIdsMock.mockReset()
  })

  it("shares pending reads but fetches fresh models immediately after completion", async () => {
    let resolve!: (models: string[]) => void
    fetchOpenAICompatibleModelIdsMock.mockImplementationOnce(
      () =>
        new Promise<string[]>((done) => {
          resolve = done
        }),
    )
    const source = {
      baseUrl: "https://shared.example.com",
      apiKey: "sk-shared",
    }
    const automatic = fetchManagedSiteImportModels(source)
    const exportSource = {
      ...source,
      name: "Export draft",
      modelHints: ["hint"],
    }
    const exported = fetchManagedSiteImportModels(exportSource)
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(1)
    resolve(["gpt-4o"])
    const [first, second] = await Promise.all([automatic, exported])
    first.models.push("local-edit")
    expect(second.models).toEqual(["gpt-4o"])
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["new-model"])
    expect((await fetchManagedSiteImportModels(source)).models).toEqual([
      "new-model",
    ])
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(2)
  })

  it("promotes shared model discovery and preserves export when its automatic consumer cancels", async () => {
    let finish!: (models: string[]) => void
    fetchOpenAICompatibleModelIdsMock.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          finish = resolve
        }),
    )
    const source = {
      baseUrl: "https://promoted.example",
      apiKey: "sk-promoted",
    }
    const controller = new AbortController()
    const automatic = fetchManagedSiteImportModels(source, {
      signal: controller.signal,
      requestScheduling: { priority: "background" },
    })
    const canceled = expect(automatic).rejects.toMatchObject({
      name: "AbortError",
    })
    const request = fetchOpenAICompatibleModelIdsMock.mock.calls[0][0]
    expect(request.requestScheduling.priority).toBe("background")
    const exported = fetchManagedSiteImportModels(source)
    expect(request.requestScheduling.priority).toBe("foreground")
    controller.abort()
    await canceled
    expect(request.abortSignal.aborted).toBe(false)
    finish(["model"])
    expect((await exported).models).toEqual(["model"])
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(1)
  })

  it("isolates source paths and credentials and retries failed lookups", async () => {
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(
      new Error("offline"),
    )
    const source = {
      baseUrl: "https://isolated.example.com/v1",
      apiKey: "sk-a",
    }
    expect((await fetchManagedSiteImportModels(source)).fetchFailed).toBe(true)
    fetchOpenAICompatibleModelIdsMock.mockResolvedValue(["model"])
    await Promise.all([
      fetchManagedSiteImportModels(source),
      fetchManagedSiteImportModels({ ...source, apiKey: "sk-b" }),
      fetchManagedSiteImportModels({
        ...source,
        baseUrl: "https://isolated.example.com/other",
      }),
    ])
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(4)
  })

  it("normalizes the fetched upstream model list for the selected token", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      " gpt-4o ",
      "",
      "gpt-4o",
      "gpt-4.1",
    ])

    await expect(
      fetchManagedSiteImportModels({
        baseUrl: "https://example.com",
        apiKey: "sk-token",
      }),
    ).resolves.toEqual({
      models: ["gpt-4o", "gpt-4.1"],
      fetchFailed: false,
    })

    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        apiKey: "sk-token",
        abortSignal: expect.any(AbortSignal),
      }),
    )
  })

  it("returns a structured fetch failure when the upstream lookup throws", async () => {
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(new Error("boom"))

    await expect(
      fetchManagedSiteImportModels({
        baseUrl: "https://example.com",
        apiKey: "sk-token",
      }),
    ).resolves.toEqual({
      models: [],
      fetchFailed: true,
    })
  })

  it("treats a nullish upstream response as an empty successful model list", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(undefined)

    await expect(
      fetchManagedSiteImportModels({
        baseUrl: "https://example.com",
        apiKey: "sk-token",
      }),
    ).resolves.toEqual({
      models: [],
      fetchFailed: false,
    })
  })
})
