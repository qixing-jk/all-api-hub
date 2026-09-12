import { describe, expect, it } from "vitest"

import { currentOctopusContract } from "~/services/apiService/octopus/current"
import { legacyOctopusContract } from "~/services/apiService/octopus/legacy"
import { OCTOPUS_API_OPERATIONS } from "~/services/apiService/octopus/operations"
import type { OctopusChannel } from "~/types/octopus"

describe("Octopus credential protocol boundaries", () => {
  it("sends native add/update/delete operations and preserves each retained key's identity", () => {
    const source = {
      keys: [
        { id: 3, enabled: false, channel_key: "first" },
        { id: 4, enabled: true, channel_key: "second" },
      ],
    } as OctopusChannel
    const request = legacyOctopusContract.createRequest(
      {
        kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
        input: {
          id: 7,
          source,
          keys: [
            { id: 4, enabled: false, channel_key: "rotated", remark: "backup" },
            { enabled: true, channel_key: "new" },
          ],
        },
      },
      {},
    )
    const body = JSON.parse(String(request.init.body))
    expect(body.keys_to_add).toEqual([{ enabled: true, channel_key: "new" }])
    expect(body.keys_to_update).toEqual([
      { id: 4, enabled: false, channel_key: "rotated", remark: "backup" },
    ])
    expect(body.keys_to_delete).toEqual([3])
  })

  it("creates all native legacy keys and rejects collections for the scalar protocol", () => {
    const operation = {
      kind: OCTOPUS_API_OPERATIONS.CreateChannel,
      input: {
        name: "multi",
        type: 0,
        baseUrl: "https://example.invalid",
        key: "first",
        keys: [
          { enabled: true, channel_key: "first" },
          { enabled: false, channel_key: "second" },
        ],
      },
    } as const
    const input = {
      ...operation,
      input: { ...operation.input, keys: [...operation.input.keys] },
    }
    expect(
      JSON.parse(
        String(legacyOctopusContract.createRequest(input, {}).init.body),
      ).keys,
    ).toEqual(operation.input.keys)
    expect(() => currentOctopusContract.createRequest(input, {})).toThrow(
      "one key per channel",
    )
  })
})
