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
  const keyStateCases = [
    {
      account: "full",
      managed: "full",
      compatibleComparable: true,
      conflictingComparable: true,
      compatibleMatched: true,
    },
    {
      account: "full",
      managed: "masked",
      compatibleComparable: false,
      conflictingComparable: true,
      compatibleMatched: false,
    },
    {
      account: "full",
      managed: "empty",
      compatibleComparable: false,
      conflictingComparable: false,
      compatibleMatched: false,
    },
    {
      account: "masked",
      managed: "full",
      compatibleComparable: false,
      conflictingComparable: true,
      compatibleMatched: false,
    },
    {
      account: "masked",
      managed: "masked",
      compatibleComparable: false,
      conflictingComparable: true,
      compatibleMatched: false,
    },
    {
      account: "masked",
      managed: "empty",
      compatibleComparable: false,
      conflictingComparable: false,
      compatibleMatched: false,
    },
    {
      account: "empty",
      managed: "full",
      compatibleComparable: false,
      conflictingComparable: false,
      compatibleMatched: false,
    },
    {
      account: "empty",
      managed: "masked",
      compatibleComparable: false,
      conflictingComparable: false,
      compatibleMatched: false,
    },
    {
      account: "empty",
      managed: "empty",
      compatibleComparable: false,
      conflictingComparable: false,
      compatibleMatched: false,
    },
  ]
  it.each(
    keyStateCases.flatMap((entry) => [
      {
        ...entry,
        relation: "compatible",
        suffix: "1234",
        comparable: entry.compatibleComparable,
        matched: entry.compatibleMatched,
      },
      {
        ...entry,
        relation: "conflicting",
        suffix: "5678",
        comparable: entry.conflictingComparable,
        matched: false,
      },
    ]),
  )(
    "handles account $account / managed $managed with $relation evidence",
    async ({ account, managed, suffix, comparable, matched }) => {
      const targetKey =
        managed === "full"
          ? `abcd-hidden-${suffix}`
          : managed === "masked"
            ? `abcd••••${suffix}`
            : ""
      const managedSite = createManagedSiteCapabilitiesStub({
        matching: {
          exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
          search: vi.fn().mockResolvedValue({
            items: [
              {
                ...candidate(1, targetKey),
                ...(managed === "masked"
                  ? { keyMasks: [{ prefix: "abcd", suffix }] }
                  : {}),
              },
            ],
          }),
        },
      })
      const result = await resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig,
        accountBaseUrl: "https://source.example",
        models: [],
        key: account === "full" ? "abcd-hidden-1234" : "",
        ...(account === "masked"
          ? { keyMask: { prefix: "abcd", suffix: "1234" } }
          : {}),
      })
      expect(result.key).toMatchObject({ comparable, matched })
      expect(
        getManagedSiteChannelExactMatch(result, managedSite.matching)?.ref ??
          null,
      ).toEqual(matched ? matchingResourceRef(1) : null)
    },
  )

  it.each(["account", "managed"])(
    "does not use an unconfirmed %s mask as negative evidence",
    async (unconfirmed) => {
      const managedSite = createManagedSiteCapabilitiesStub({
        matching: {
          search: vi.fn().mockResolvedValue({
            items: [
              candidate(
                1,
                unconfirmed === "managed" ? "abcd••••5678" : "abcd-hidden-5678",
              ),
            ],
          }),
        },
      })
      const result = await resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig,
        accountBaseUrl: "https://source.example",
        models: [],
        key: unconfirmed === "account" ? "abcd••••1234" : "abcd-hidden-1234",
      })
      expect(result.key).toMatchObject({ comparable: false, matched: false })
    },
  )

  it.each([
    {
      key: "abcdefgh1234",
      prefix: "abcd",
      suffix: "1234",
      visibleKey: "abcdefgh1234",
    },
    {
      key: "sk-abcdefgh1234",
      prefix: "abcd",
      suffix: "1234",
      visibleKey: "abcdefgh1234",
    },
    {
      key: "abcdefgh1234",
      prefix: "sk-a",
      suffix: "1234",
      visibleKey: "sk-abcdefgh1234",
    },
    {
      key: "sk-sk-abcdef1234",
      prefix: "sk-s",
      suffix: "1234",
      visibleKey: "sk-sk-abcdef1234",
    },
  ])(
    "reveals a compatible mask and confirms the original identity: $key / $prefix",
    async ({ key, prefix, suffix, visibleKey }) => {
      const fetchSecretKey = vi.fn().mockResolvedValue(visibleKey)
      const managedSite = createManagedSiteCapabilitiesStub({
        matching: {
          exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
          search: vi.fn().mockResolvedValue({
            items: [{ ...candidate(1), keyMasks: [{ prefix, suffix }] }],
          }),
          fetchSecretKey,
        },
      })
      const result = await resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig,
        accountBaseUrl: "https://source.example",
        key,
        models: [],
        resolveHiddenKeys: true,
        stopAfterExactMatch: true,
        protectionBypassExecution,
      })
      expect(result.key).toMatchObject({ comparable: true, matched: true })
      expect(fetchSecretKey).toHaveBeenCalledOnce()
    },
  )

  it.each([
    {
      name: "different anchored prefixes",
      source: { prefix: "abcd", suffix: "1234" },
      pool: [{ prefix: "wxyz", suffix: "1234" }],
      comparable: true,
    },
    {
      name: "different anchored suffixes",
      source: { prefix: "abcd", suffix: "1234" },
      pool: [{ prefix: "abcd", suffix: "5678" }],
      comparable: true,
    },
    {
      name: "overlapping prefixes of unequal lengths",
      source: { prefix: "abcdefgh", suffix: "1234" },
      pool: [{ prefix: "abcd", suffix: "34" }],
      comparable: false,
    },
    {
      name: "a compatible key in a complete pool",
      source: { prefix: "abcd", suffix: "1234" },
      pool: [
        { prefix: "other", suffix: "5678" },
        { prefix: "abcd", suffix: "1234" },
      ],
      comparable: false,
    },
    {
      name: "a fully hidden key in a complete pool",
      source: { prefix: "abcd", suffix: "1234" },
      pool: [
        { prefix: "other", suffix: "5678" },
        { prefix: "", suffix: "" },
      ],
      comparable: false,
    },
    {
      name: "no complete mask pool",
      source: { prefix: "abcd", suffix: "1234" },
      pool: undefined,
      comparable: false,
    },
    {
      name: "prefix and suffix do not align with each other",
      source: { prefix: "abcd", suffix: "" },
      pool: [{ prefix: "", suffix: "wxyz" }],
      comparable: false,
    },
    {
      name: "optional auth prefix",
      source: { prefix: "sk-abcd", suffix: "1234" },
      pool: [{ prefix: "abcd", suffix: "1234" }],
      comparable: false,
    },
    {
      name: "partial optional auth prefix",
      source: { prefix: "sk", suffix: "1234" },
      pool: [{ prefix: "abcd", suffix: "1234" }],
      comparable: false,
    },
  ])(
    "only excludes impossible masked identities: $name",
    async ({ source, pool, comparable }) => {
      const fetchSecretKey = vi
        .fn()
        .mockRejectedValue(new Error("must not reveal"))
      const managedSite = createManagedSiteCapabilitiesStub({
        matching: {
          search: vi.fn().mockResolvedValue({
            items: [{ ...candidate(1), keyMasks: pool }],
          }),
          fetchSecretKey,
        },
      })
      const result = await resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig,
        accountBaseUrl: "https://source.example",
        key: "",
        keyMask: source,
        models: [],
        resolveHiddenKeys: true,
        stopAfterExactMatch: true,
        protectionBypassExecution,
      })
      expect(result.key).toMatchObject({ comparable, matched: false })
      expect(fetchSecretKey).not.toHaveBeenCalled()
    },
  )

  it("rules out a conflicting trusted mask without revealing the candidate", async () => {
    const fetchSecretKey = vi
      .fn()
      .mockRejectedValue(new Error("must not reveal"))
    const hydrateComparableKeys = vi
      .fn()
      .mockRejectedValue(new Error("must not hydrate"))
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ...candidate(1, "othe••••••1234"),
              keyMasks: [{ prefix: "othe", suffix: "1234" }],
            },
          ],
        }),
        fetchSecretKey,
        hydrateComparableKeys,
      },
    })
    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://source.example",
      key: "source-key-1234",
      models: ["gpt-4o"],
      resolveHiddenKeys: true,
      stopAfterExactMatch: true,
      protectionBypassExecution,
    })
    expect(result.key).toMatchObject({
      comparable: true,
      matched: false,
      reason: "no-match",
    })
    expect(fetchSecretKey).not.toHaveBeenCalled()
    expect(hydrateComparableKeys).not.toHaveBeenCalled()
  })

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
