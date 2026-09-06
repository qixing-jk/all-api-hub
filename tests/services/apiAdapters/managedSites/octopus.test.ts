import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  octopusManagedResourceModels,
  octopusManagedSiteCapabilities,
} from "~/services/apiAdapters/managedSites/octopus"
import type { OctopusChannel } from "~/types/octopus"

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

  const channel: OctopusChannel = {
    id: 7,
    name: "Native channel",
    type: 0,
    enabled: true,
    base_urls: [{ url: "https://upstream.example" }],
    keys: [
      { channel_key: "first-key", enabled: true },
      { channel_key: "", enabled: false },
      { channel_key: "second-key", enabled: true },
    ],
    model: "model-a,model-b",
    custom_model: "custom-model",
    proxy: true,
    auto_sync: true,
    auto_group: 0,
    custom_header: [{ header_key: "x-provider", header_value: "native" }],
  }

  it("counts native model inventory types and retains the settings needed for probing", async () => {
    octopusApi.listChannels.mockResolvedValue([
      channel,
      { ...channel, id: 8, enabled: false, base_urls: [], keys: [], model: "" },
      { ...channel, id: 9, type: 2 },
    ])

    const result = await octopusManagedResourceModels.list(config)

    expect(result.total).toBe(3)
    expect(result.type_counts).toEqual({ "0": 2, "2": 1 })
    expect(result.items[0]).toEqual({
      id: 7,
      name: "Native channel",
      type: 0,
      base_url: "https://upstream.example",
      key: "first-key",
      models: "model-a,model-b",
      status: 1,
      model_mapping: "",
      native: { kind: "octopus", data: channel },
    })
    expect(result.items[1]).toMatchObject({
      id: 8,
      base_url: "",
      key: "",
      models: "",
      status: 2,
    })
  })

  it("includes every available Octopus key in matching evidence without native CRUD settings", async () => {
    octopusApi.searchChannels.mockResolvedValue([
      channel,
      { ...channel, id: 8, base_urls: [], keys: [], model: "" },
    ])

    await expect(
      octopusManagedSiteCapabilities.matching.search(config, "upstream"),
    ).resolves.toEqual({
      items: [
        {
          id: 7,
          name: "Native channel",
          type: 0,
          base_url: "https://upstream.example",
          models: "model-a,model-b",
          key: "first-key\nsecond-key",
        },
        {
          id: 8,
          name: "Native channel",
          type: 0,
          base_url: "",
          models: "",
          key: "",
        },
      ],
      total: 2,
      type_counts: {},
    })
    expect(octopusApi.searchChannels).toHaveBeenCalledWith(config, "upstream")
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
