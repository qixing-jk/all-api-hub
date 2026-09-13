import { describe, expect, it } from "vitest"

import { currentOctopusContract } from "~/services/apiService/octopus/current"
import { legacyOctopusContract } from "~/services/apiService/octopus/legacy"
import { OCTOPUS_API_OPERATIONS } from "~/services/apiService/octopus/operations"
import type { OctopusChannel } from "~/types/octopus"

const source: OctopusChannel = {
  id: 7,
  name: "Channel",
  type: 2,
  enabled: true,
  base_urls: [{ url: "https://upstream.example" }],
  keys: [
    { id: 8, enabled: false, channel_key: "retained", remark: "keep" },
    { id: 19, enabled: true, channel_key: "remove-me" },
  ],
  model: "model-a",
  proxy: false,
  auto_sync: false,
  auto_group: 0,
}
describe("Octopus key removal codecs", () => {
  it("sends native key IDs without rewriting retained keys on the legacy protocol", () => {
    const request = legacyOctopusContract.createRequest(
      {
        kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
        input: { id: 7, removeKeys: ["remove-me"], source },
      },
      {},
    )
    expect(JSON.parse(String(request.init.body))).toEqual({
      id: 7,
      auto_group: 0,
      keys_to_delete: [19],
    })
    expect(source.keys[0]).toEqual({
      id: 8,
      enabled: false,
      channel_key: "retained",
      remark: "keep",
    })
  })
  it("rejects missing legacy identities before issuing an ambiguous mutation", () => {
    expect(() =>
      legacyOctopusContract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
          input: {
            id: 7,
            removeKeys: ["remove-me"],
            source: {
              ...source,
              keys: [{ enabled: true, channel_key: "remove-me" }],
            },
          },
        },
        {},
      ),
    ).toThrow("Missing native key identity")
  })
  it("does not silently ignore key removal on the scalar protocol", () => {
    expect(() =>
      currentOctopusContract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
          input: { id: 7, removeKeys: ["remove-me"] },
        },
        {},
      ),
    ).toThrow("no multi-key collection")
  })
})
