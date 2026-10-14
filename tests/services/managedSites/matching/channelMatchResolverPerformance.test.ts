import { describe, expect, it, vi } from "vitest"

import { MANAGED_RESOURCE_EXACT_MATCH_BASES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { getManagedSiteChannelExactMatch } from "~/services/managedSites/matching/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/matching/channelMatchResolver"
import {
  buildManagedResourceMatchCandidate,
  matchingResourceRef,
} from "~~/tests/test-utils/managedResourceMatching"
import { createManagedSiteCapabilitiesStub } from "~~/tests/test-utils/managedSiteCapabilitiesFactory"

const managedConfig = {
  baseUrl: "https://managed.example",
  adminToken: "token",
  userId: "1",
}
const protectionBypassExecution = {
  version: 2 as const,
  kind: "automatic" as const,
  feature: "managed_site_channels" as const,
  trigger: "background_recovery" as const,
  surface: "background" as const,
}
const candidate = (id: number, key = "********", models = "gpt-4o") =>
  buildManagedResourceMatchCandidate({
    ref: matchingResourceRef(id),
    base_url: "https://source.example",
    key,
    models,
  })

describe("existence-only channel matching", () => {
  it("aligns URL identity with the matching second candidate", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
        search: vi.fn().mockResolvedValue({
          items: [candidate(1, "other"), candidate(2, "source-key")],
        }),
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: [],
      stopAfterExactMatch: true,
    })
    expect(
      getManagedSiteChannelExactMatch(result, managedSite.matching)?.ref,
    ).toEqual(matchingResourceRef(2))
  })

  it("finds the same key with exact models after a candidate with different models", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            candidate(1, "source-key", "other-model"),
            candidate(2, "source-key"),
          ],
        }),
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: ["gpt-4o"],
      stopAfterExactMatch: true,
    })
    expect(
      getManagedSiteChannelExactMatch(result, managedSite.matching)?.ref,
    ).toEqual(matchingResourceRef(2))
  })

  it("uses a visible exact duplicate without revealing its hidden siblings", async () => {
    const fetchSecretKey = vi.fn().mockResolvedValue("other")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [candidate(1), candidate(2, "source-key")],
        }),
        fetchSecretKey,
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: ["gpt-4o"],
      resolveHiddenKeys: true,
      stopAfterExactMatch: true,
      protectionBypassExecution,
    })
    expect(
      getManagedSiteChannelExactMatch(result, managedSite.matching)?.ref,
    ).toEqual(matchingResourceRef(2))
    expect(fetchSecretKey).not.toHaveBeenCalled()
  })

  it("stops revealing after the first proven duplicate", async () => {
    const fetchSecretKey = vi.fn().mockResolvedValue("source-key")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi
          .fn()
          .mockResolvedValue({ items: [candidate(1), candidate(2)] }),
        fetchSecretKey,
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: ["gpt-4o"],
      resolveHiddenKeys: true,
      stopAfterExactMatch: true,
      protectionBypassExecution,
    })
    expect(
      getManagedSiteChannelExactMatch(result, managedSite.matching)?.ref,
    ).toEqual(matchingResourceRef(1))
    expect(fetchSecretKey).toHaveBeenCalledOnce()
  })

  it("reads every candidate before declaring a negative comparison", async () => {
    const fetchSecretKey = vi.fn().mockResolvedValue("other-key")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi
          .fn()
          .mockResolvedValue({ items: [candidate(1), candidate(2)] }),
        fetchSecretKey,
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: ["gpt-4o"],
      resolveHiddenKeys: true,
      stopAfterExactMatch: true,
      protectionBypassExecution,
    })
    expect(result.key).toMatchObject({ comparable: true, matched: false })
    expect(fetchSecretKey).toHaveBeenCalledTimes(2)
  })

  it("keeps searching when only the key matches different models", async () => {
    const fetchSecretKey = vi.fn().mockResolvedValue("source-key")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [candidate(1, "********", "other-model"), candidate(2)],
        }),
        fetchSecretKey,
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: ["gpt-4o"],
      resolveHiddenKeys: true,
      stopAfterExactMatch: true,
      protectionBypassExecution,
    })
    expect(
      getManagedSiteChannelExactMatch(result, managedSite.matching)?.ref,
    ).toEqual(matchingResourceRef(2))
    expect(fetchSecretKey).toHaveBeenCalledTimes(2)
  })

  it("preserves complete hidden-key resolution for ordinary status checks", async () => {
    const fetchSecretKey = vi.fn().mockResolvedValue("source-key")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi
          .fn()
          .mockResolvedValue({ items: [candidate(1), candidate(2)] }),
        fetchSecretKey,
      },
    })
    await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key",
      models: ["gpt-4o"],
      resolveHiddenKeys: true,
      protectionBypassExecution,
    })
    expect(fetchSecretKey).toHaveBeenCalledTimes(2)
  })
})
