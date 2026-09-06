import { beforeEach, describe, expect, it, vi } from "vitest"

import { octopusManagedResourceModels } from "~/services/apiAdapters/managedSites/octopus"

const octopusApi = vi.hoisted(() => {
  class OctopusMutationApiError extends Error {
    override readonly name = "OctopusMutationApiError"

    constructor(
      message: string,
      readonly evidence: {
        dispatch: "not-dispatched" | "dispatched"
        responseReceived: boolean
        confirmedNonApplication: boolean
        raw: unknown
        code?: string | number
      },
    ) {
      super(message)
    }

    get dispatch() {
      return this.evidence.dispatch
    }

    get responseReceived() {
      return this.evidence.responseReceived
    }

    get confirmedNonApplication() {
      return this.evidence.confirmedNonApplication
    }

    get raw() {
      return this.evidence.raw
    }

    get code() {
      return this.evidence.code
    }
  }

  return {
    OctopusMutationApiError,
    getChannel: vi.fn(),
    listChannels: vi.fn(),
    searchChannels: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    fetchGroups: vi.fn(),
    fetchAvailableModels: vi.fn(),
  }
})

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/apiService/octopus", () => ({
  ...octopusApi,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("Octopus managed-site channel capability", () => {
  const config = {
    baseUrl: "https://octopus.example.invalid",
    username: "admin",
    password: "password",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    userPreferences.getPreferences.mockResolvedValue({
      octopus: config,
    })
  })

  it("awaits the request gate before loading model inventory", async () => {
    let release!: () => void
    const beforeRequest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    octopusApi.listChannels.mockResolvedValue([])
    const pending = octopusManagedResourceModels.list(config, { beforeRequest })
    expect(beforeRequest).toHaveBeenCalledOnce()
    expect(octopusApi.listChannels).not.toHaveBeenCalled()
    release()
    await expect(pending).resolves.toMatchObject({ items: [], total: 0 })
    expect(octopusApi.listChannels).toHaveBeenCalledOnce()
  })

  it("does not dispatch model inventory when the request gate rejects", async () => {
    const error = new Error("cancelled gate")
    await expect(
      octopusManagedResourceModels.list(config, {
        beforeRequest: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toBe(error)
    expect(octopusApi.listChannels).not.toHaveBeenCalled()
  })

  it("updates scheduled model lists through the common mutation boundary without changing the payload", async () => {
    octopusApi.updateChannel.mockResolvedValueOnce({
      success: true,
      data: { id: 7 },
      message: "",
    })

    const controller = new AbortController()

    await expect(
      octopusManagedResourceModels.updateModels?.(
        config,
        7,
        ["model-a", "model-b"],
        {
          signal: controller.signal,
          bypassSiteRequestLimit: true,
        },
      ),
    ).resolves.toEqual({
      outcome: "succeeded",
      confirmedEffects: [
        {
          kind: "models-updated",
          resourceKind: "channel",
          resourceId: 7,
        },
      ],
      data: undefined,
    })

    expect(octopusApi.updateChannel).toHaveBeenCalledWith(
      config,
      { id: 7, model: "model-a,model-b" },
      { signal: controller.signal },
    )
  })

  it("updates scheduled model lists without adding empty request options", async () => {
    octopusApi.updateChannel.mockResolvedValueOnce({
      success: true,
      data: { id: 7 },
      message: "",
    })

    await expect(
      octopusManagedResourceModels.updateModels?.(config, 7, ["model-a"]),
    ).resolves.toMatchObject({ outcome: "succeeded", data: undefined })

    expect(octopusApi.updateChannel).toHaveBeenCalledWith(config, {
      id: 7,
      model: "model-a",
    })
  })
})
