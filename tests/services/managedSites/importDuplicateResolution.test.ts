import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import type { ManagedSiteChannelMatchContext } from "~/services/managedSites/channelMatchResolver"
import { resolveManagedSiteImportDuplicate } from "~/services/managedSites/importDuplicateResolution"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"

const managedConfig = {
  baseUrl: "https://managed.example",
  adminToken: "managed-token",
  userId: "1",
}

const sessionResyncExecution = {
  version: 2 as const,
  kind: "automatic" as const,
  feature: "managed_site_channels" as const,
  trigger: "background_recovery" as const,
  surface: "background" as const,
}

const formData = {
  name: "Imported Channel",
  type: "openai",
  key: "test-key",
  base_url: "https://api.example.com",
  models: ["gpt-4o"],
  groups: ["default"],
  priority: 0,
  weight: 1,
  enabled: true,
}

const createService = (
  overrides: Omit<ManagedSiteChannelMatchContext, "siteType"> &
    Partial<Pick<ManagedSiteChannelMatchContext, "siteType">>,
): ManagedSiteChannelMatchContext => ({
  siteType: SITE_TYPES.NEW_API,
  ...overrides,
})

describe("resolveManagedSiteImportDuplicate", () => {
  it("defaults unresolved exact-model hidden-key duplicates to verification required", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(42),
              name: "Masked Duplicate",
              key: "",
              base_url: "https://api.example.com",
              models: "gpt-4o",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).rejects.toMatchObject({
      name: MatchResolutionUnresolvedError.name,
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    })
  })

  it("preserves provider unresolved reasons for exact-model hidden-key duplicates", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(43),
              name: "Masked Duplicate",
              key: "",
              base_url: "https://api.example.com",
              models: "gpt-4o",
            },
          ],
        }),
        hydrateComparableKeys: vi.fn(async () => {
          throw new MatchResolutionUnresolvedError(
            MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
          )
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
        protectionBypassExecution: sessionResyncExecution,
      }),
    ).rejects.toMatchObject({
      name: MatchResolutionUnresolvedError.name,
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    })
  })

  it("returns null when hidden-key comparison is unavailable without an exact model match", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(44),
              name: "Masked Different Models",
              key: "",
              base_url: "https://api.example.com",
              models: "claude-3",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("returns null when search finds no duplicate candidates", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("propagates search failures from duplicate lookup", async () => {
    const searchError = new Error("API unavailable")
    const managedSite = createService({
      matching: { search: vi.fn().mockRejectedValue(searchError) },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).rejects.toBe(searchError)
  })

  it("prefers the exact key and model duplicate from multiple candidates", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(47),
              name: "Same Models Different Key",
              key: "test-other-key",
              base_url: "https://api.example.com",
              models: "gpt-4o",
            },
            {
              ref: matchingResourceRef(48),
              name: "Exact Duplicate",
              key: "test-key",
              base_url: "https://api.example.com",
              models: "gpt-4o",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).resolves.toMatchObject({
      ref: matchingResourceRef(48),
      name: "Exact Duplicate",
    })
  })

  it("ignores candidates with valid identities but no comparable import inputs", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(48),
              name: "Unrelated Channel",
              key: "test-key",
              base_url: "https://other.example.com",
              models: "gpt-4o",
            },
            {
              ref: matchingResourceRef(49),
              key: "test-key",
              base_url: "",
              models: "",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("rejects an inventory without a complete resource identity before concluding there is no duplicate", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              name: "Missing Identifier",
              key: "test-key",
              base_url: "https://other.example.com",
              models: "gpt-4o",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  })

  it("matches duplicate candidates with the same multiple-model set", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(50),
              name: "Multiple Model Duplicate",
              key: "test-key",
              base_url: "https://api.example.com",
              models: "gpt-4o,gpt-4o-mini",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData: {
          ...formData,
          models: ["gpt-4o", "gpt-4o-mini"],
        },
      }),
    ).resolves.toMatchObject({
      ref: matchingResourceRef(50),
      name: "Multiple Model Duplicate",
    })
  })

  it("returns null when import form data has no models to compare", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(51),
              name: "No Model Candidate",
              key: "test-key",
              base_url: "https://api.example.com",
              models: "",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData: {
          ...formData,
          models: [],
        },
      }),
    ).resolves.toBeNull()
  })

  it("uses Sub2API URL and key identity without requiring models", async () => {
    const managedSite = createService({
      siteType: SITE_TYPES.SUB2API,
      matching: {
        exactMatchBasis: "url-key",
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(52, { siteType: SITE_TYPES.SUB2API }),
              name: "Sub2API Duplicate",
              key: "test-key",
              base_url: "https://api.example.com",
              models: "",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData: { ...formData, models: [] },
      }),
    ).resolves.toMatchObject({
      ref: matchingResourceRef(52, { siteType: SITE_TYPES.SUB2API }),
      name: "Sub2API Duplicate",
    })
  })

  it("does not merge separate Sub2API URL and key matches into one duplicate", async () => {
    const managedSite = createService({
      siteType: SITE_TYPES.SUB2API,
      matching: {
        exactMatchBasis: "url-key",
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(53, { siteType: SITE_TYPES.SUB2API }),
              name: "URL Match",
              key: "different-key",
              base_url: "https://api.example.com",
              models: "",
            },
            {
              ref: matchingResourceRef(54, { siteType: SITE_TYPES.SUB2API }),
              name: "Key Match",
              key: "test-key",
              base_url: "https://other.example.com",
              models: "",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData: { ...formData, models: [] },
      }),
    ).resolves.toBeNull()
  })

  it("returns exact duplicate channels", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(45),
              name: "Exact Duplicate",
              key: "test-key",
              base_url: "https://api.example.com",
              models: "gpt-4o",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).resolves.toMatchObject({
      ref: matchingResourceRef(45),
      name: "Exact Duplicate",
    })
  })

  it("passes through non-hidden-key non-matches", async () => {
    const managedSite = createService({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(46),
              name: "Different Key",
              key: "test-other-key",
              base_url: "https://api.example.com",
              models: "gpt-4o",
            },
          ],
        }),
      },
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        managedSite,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })
})
