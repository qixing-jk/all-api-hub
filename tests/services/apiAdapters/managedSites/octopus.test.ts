import { beforeEach, describe, expect, it, vi } from "vitest"

import { octopusManagedResourceModels } from "~/services/apiAdapters/managedResources/octopusOperations"
import { octopusManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/octopus"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { OctopusChannel } from "~/types/octopus"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

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
          ref: modelResourceRef(7, {
            siteType: "octopus",
            scopeKey: config.baseUrl,
          }),
          name: "Native channel",
          type: 0,
          base_url: "https://upstream.example",
          models: "model-a,model-b",
          key: "first-key\nsecond-key",
        },
        {
          ref: modelResourceRef(8, {
            siteType: "octopus",
            scopeKey: config.baseUrl,
          }),
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
    expect(octopusApi.searchChannels).toHaveBeenCalledWith(
      config,
      "upstream",
      undefined,
    )
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
        modelResourceRef(7, { siteType: "octopus", scopeKey: config.baseUrl }),
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
      octopusManagedResourceModels.updateModels?.(
        config,
        modelResourceRef(7, { siteType: "octopus", scopeKey: config.baseUrl }),
        ["model-a"],
      ),
    ).resolves.toMatchObject({ outcome: "succeeded", data: undefined })

    expect(octopusApi.updateChannel).toHaveBeenCalledWith(config, {
      id: 7,
      model: "model-a",
    })
  })

  it("retains explicit user intent when updating an Octopus model list", async () => {
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
    )
    const signal = new AbortController().signal
    octopusApi.updateChannel.mockResolvedValueOnce({
      success: true,
      data: { id: 7 },
      message: "",
    })

    await expect(
      octopusManagedResourceModels.updateModels(
        config,
        modelResourceRef(7, { siteType: "octopus", scopeKey: config.baseUrl }),
        ["model-a"],
        {
          signal,
          protectionBypassExecution,
        },
      ),
    ).resolves.toMatchObject({ outcome: "succeeded" })
    expect(octopusApi.updateChannel).toHaveBeenCalledWith(
      config,
      { id: 7, model: "model-a" },
      { signal, protectionBypassExecution },
    )
  })
})
