import { describe, expect, it } from "vitest"

import { MANAGED_RESOURCE_SEARCH_INVENTORY_MODES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { getManagedSiteChannelExactMatch } from "~/services/managedSites/matching/channelMatch"
import {
  createManagedSiteChannelMatchRequestCache,
  resolveManagedSiteChannelMatch,
} from "~/services/managedSites/matching/channelMatchResolver"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"
import { createManagedSiteCapabilitiesStub } from "~~/tests/test-utils/managedSiteCapabilitiesFactory"

const config = {
  baseUrl: "https://managed.example",
  adminToken: "admin",
  userId: "1",
}

describe("batch matching inventory", () => {
  it("matches distinct sources without repeatedly decoding unrelated full-inventory addresses", async () => {
    let addressReads = 0
    const items = Array.from({ length: 500 }, (_, index) => ({
      ref: matchingResourceRef(index + 1),
      name: `Channel ${index}`,
      type: 1,
      get base_url() {
        addressReads += 1
        return `https://source-${index}.invalid/v1`
      },
      models: "model",
      key: `key-${index}`,
    }))
    const inventory = { items, total: items.length, type_counts: {} }
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        searchInventoryMode: MANAGED_RESOURCE_SEARCH_INVENTORY_MODES.FULL,
        search: async () => inventory,
      },
    })
    const requestCache = createManagedSiteChannelMatchRequestCache()
    for (let index = 0; index < 20; index += 1) {
      const resolution = await resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig: config,
        requestCache,
        accountBaseUrl: `https://source-${index}.invalid`,
        models: ["model"],
        key: `key-${index}`,
      })
      expect(getManagedSiteChannelExactMatch(resolution)?.ref).toEqual(
        matchingResourceRef(index + 1),
      )
    }
    // Allow substantial per-source assessment work, while bounding unrelated inventory traversal.
    expect(addressReads).toBeLessThan(2000)
  })

  it("rejects a foreign resource even when its address is outside the requested bucket", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        searchInventoryMode: MANAGED_RESOURCE_SEARCH_INVENTORY_MODES.FULL,
        search: async () => ({
          items: [
            {
              ref: matchingResourceRef(1, {
                scopeKey: "https://foreign.invalid",
              }),
              name: "Foreign",
              type: 1,
              base_url: "https://unrelated.invalid",
              models: "model",
              key: "key",
            },
          ],
          total: 1,
          type_counts: {},
        }),
      },
    })
    await expect(
      resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig: config,
        requestCache: createManagedSiteChannelMatchRequestCache(),
        accountBaseUrl: "https://source.invalid",
        models: ["model"],
        key: "key",
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  })
})
