import { describe, expect, it } from "vitest"

import { toManagedModelChannelList } from "~/services/apiAdapters/managedResources/modelInputs"
import type { ManagedModelChannel } from "~/types/managedResourceModels"
import type { OctopusChannel } from "~/types/octopus"

describe("managed model inventory projection", () => {
  it("retains explicit native probe data while excluding unrelated provider fields", () => {
    const native: OctopusChannel = {
      id: 7,
      name: "Native channel",
      type: 0,
      enabled: true,
      base_urls: [{ url: "https://upstream.example" }],
      keys: [{ channel_key: "probe-key", enabled: true }],
      model: "model-a",
      custom_model: "custom-model",
      proxy: true,
      auto_sync: true,
      auto_group: 0,
    }
    const channel: ManagedModelChannel = {
      id: 7,
      name: "Native channel",
      type: 0,
      base_url: "https://upstream.example",
      key: "probe-key",
      models: "model-a",
      status: 1,
      model_mapping: "",
      native: { kind: "octopus", data: native },
    }
    const providerChannel = { ...channel, balance: 123 }

    const result = toManagedModelChannelList({
      items: [providerChannel],
      total: 1,
      type_counts: { "0": 1 },
    })

    expect(result.items).toEqual([channel])
    expect(result.items[0].native?.data).toBe(native)
  })
})
