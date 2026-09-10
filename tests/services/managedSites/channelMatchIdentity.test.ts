import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createManagedSiteChannelMatchRequestCache,
  resolveManagedSiteChannelMatch,
} from "~/services/managedSites/channelMatchResolver"
import {
  createManagedChannelResourceRef,
  getManagedResourceRefKey,
} from "~/services/managedSites/managedResourceIdentity"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const config = {
  baseUrl: "https://managed.example",
  adminToken: "admin",
  userId: "1",
}
const execution = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
)
const candidate = (
  baseUrl: string,
  resourceId = "7",
): ManagedResourceMatchCandidate => ({
  ref: createManagedChannelResourceRef(SITE_TYPES.NEW_API, baseUrl, resourceId),
  name: "Candidate",
  type: 1,
  base_url: "https://upstream.example",
  models: "gpt-4o",
  key: "********",
})
const inputs = {
  accountBaseUrl: "https://upstream.example",
  key: "first-key",
  models: ["gpt-4o"],
  resolveHiddenKeys: true,
  protectionBypassExecution: execution,
}

describe("scoped matching identity", () => {
  it("isolates inventory and secret caches across deployments with identical native ids", async () => {
    const search = vi.fn(async (target: typeof config) => ({
      items: [candidate(target.baseUrl)],
      total: 1,
      type_counts: {},
    }))
    const fetchSecretKey = vi.fn(async (target: typeof config) =>
      target.baseUrl === config.baseUrl ? "first-key" : "second-key",
    )
    const managedSite = {
      siteType: SITE_TYPES.NEW_API,
      matching: { search, fetchSecretKey },
    }
    const requestCache = createManagedSiteChannelMatchRequestCache()
    await resolveManagedSiteChannelMatch({
      ...inputs,
      managedSite,
      managedConfig: config,
      requestCache,
    })
    const other = { ...config, baseUrl: "https://other.example" }
    const result = await resolveManagedSiteChannelMatch({
      ...inputs,
      key: "second-key",
      managedSite,
      managedConfig: other,
      requestCache,
    })

    expect(search).toHaveBeenCalledTimes(2)
    expect(fetchSecretKey).toHaveBeenNthCalledWith(
      2,
      other,
      candidate(other.baseUrl).ref,
      { protectionBypassExecution: execution },
    )
    expect(result.key.channel?.ref).toEqual(candidate(other.baseUrl).ref)
    expect(result.key.matched).toBe(true)
    expect(result.resolvedChannelKeysByResourceKey).toEqual({
      [getManagedResourceRefKey(candidate(other.baseUrl).ref)]: "second-key",
    })

    await resolveManagedSiteChannelMatch({
      ...inputs,
      managedSite,
      managedConfig: config,
      requestCache,
    })
    expect(search).toHaveBeenCalledTimes(2)
    expect(fetchSecretKey).toHaveBeenCalledTimes(2)
  })

  it("rejects foreign hidden-key selections before searching or revealing", async () => {
    const search = vi.fn()
    const fetchSecretKey = vi.fn()
    await expect(
      resolveManagedSiteChannelMatch({
        ...inputs,
        managedConfig: config,
        managedSite: {
          siteType: SITE_TYPES.NEW_API,
          matching: { search, fetchSecretKey },
        },
        hiddenKeyResourceRefs: [candidate("https://other.example").ref],
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(search).not.toHaveBeenCalled()
    expect(fetchSecretKey).not.toHaveBeenCalled()
  })

  it("rejects foreign inventory before using its matching facts or reading secrets", async () => {
    const fetchSecretKey = vi.fn()
    await expect(
      resolveManagedSiteChannelMatch({
        ...inputs,
        managedConfig: config,
        managedSite: {
          siteType: SITE_TYPES.NEW_API,
          matching: {
            search: vi
              .fn()
              .mockResolvedValue({
                items: [candidate("https://other.example")],
              }),
            fetchSecretKey,
          },
        },
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(fetchSecretKey).not.toHaveBeenCalled()
  })

  it.each(["foreign-scope", "unrequested-resource"])(
    "rejects %s hydration before caching any returned key",
    async (invalid) => {
      const expected = candidate(config.baseUrl)
      const unexpected =
        invalid === "foreign-scope"
          ? candidate("https://other.example")
          : candidate(config.baseUrl, "8")
      const requestCache = createManagedSiteChannelMatchRequestCache()
      await expect(
        resolveManagedSiteChannelMatch({
          ...inputs,
          managedConfig: config,
          requestCache,
          managedSite: {
            siteType: SITE_TYPES.NEW_API,
            matching: {
              search: vi.fn().mockResolvedValue({ items: [expected] }),
              hydrateComparableKeys: vi.fn().mockResolvedValue([
                { ...expected, key: "valid-key" },
                { ...unexpected, key: "unexpected-key" },
              ]),
            },
          },
        }),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(requestCache.resolvedChannelKeysByResourceKey).toEqual({})
    },
  )
})
