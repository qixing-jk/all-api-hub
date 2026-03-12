import { describe, expect, it } from "vitest"

import { findManagedSiteChannelsByBaseUrlAndModels } from "~/services/managedSites/utils/channelMatching"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

describe("channelMatching", () => {
  it("dedupes stored channel models before comparing comparable inputs", () => {
    const channels = [
      buildManagedSiteChannel({
        id: 1,
        base_url: "https://api.example.com",
        models: "gpt-4,gpt-4",
      }),
    ]

    const result = findManagedSiteChannelsByBaseUrlAndModels({
      channels,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
    })

    expect(result).toEqual(channels)
  })
})
