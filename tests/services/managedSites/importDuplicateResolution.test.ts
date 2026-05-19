import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import type { ManagedSiteChannelMatchService } from "~/services/managedSites/channelMatchResolver"
import { resolveManagedSiteImportDuplicate } from "~/services/managedSites/importDuplicateResolution"
import { CHANNEL_STATUS } from "~/types/managedSite"

const managedConfig = {
  baseUrl: "https://managed.example",
  adminToken: "managed-token",
  userId: "1",
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
  status: CHANNEL_STATUS.Enable,
}

const createService = (
  overrides: Omit<ManagedSiteChannelMatchService, "siteType"> &
    Partial<Pick<ManagedSiteChannelMatchService, "siteType">>,
): ManagedSiteChannelMatchService => ({
  siteType: SITE_TYPES.NEW_API,
  ...overrides,
})

describe("resolveManagedSiteImportDuplicate", () => {
  it("defaults unresolved exact-model hidden-key duplicates to verification required", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 42,
            name: "Masked Duplicate",
            key: "",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
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
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 43,
            name: "Masked Duplicate",
            key: "",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
      hydrateComparableChannelKeys: vi.fn(async () => {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
        )
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).rejects.toMatchObject({
      name: MatchResolutionUnresolvedError.name,
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    })
  })

  it("returns null when hidden-key comparison is unavailable without an exact model match", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 44,
            name: "Masked Different Models",
            key: "",
            base_url: "https://api.example.com",
            models: "claude-3",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("returns null when search finds no duplicate candidates", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("propagates search failures from duplicate lookup", async () => {
    const searchError = new Error("API unavailable")
    const service = createService({
      searchChannel: vi.fn().mockRejectedValue(searchError),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).rejects.toBe(searchError)
  })

  it("prefers the exact key and model duplicate from multiple candidates", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 47,
            name: "Same Models Different Key",
            key: "test-other-key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
          {
            id: 48,
            name: "Exact Duplicate",
            key: "test-key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toMatchObject({
      id: 48,
      name: "Exact Duplicate",
    })
  })

  it("ignores malformed candidates that cannot match comparable import inputs", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            name: "Missing Identifier",
            key: "test-key",
            base_url: "https://other.example.com",
            models: "gpt-4o",
          },
          {
            id: 49,
            key: "test-key",
            base_url: "",
            models: "",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("matches duplicate candidates with the same multiple-model set", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 50,
            name: "Multiple Model Duplicate",
            key: "test-key",
            base_url: "https://api.example.com",
            models: "gpt-4o,gpt-4o-mini",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData: {
          ...formData,
          models: ["gpt-4o", "gpt-4o-mini"],
        },
      }),
    ).resolves.toMatchObject({
      id: 50,
      name: "Multiple Model Duplicate",
    })
  })

  it("returns null when import form data has no models to compare", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 51,
            name: "No Model Candidate",
            key: "test-key",
            base_url: "https://api.example.com",
            models: "",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData: {
          ...formData,
          models: [],
        },
      }),
    ).resolves.toBeNull()
  })

  it("returns exact duplicate channels", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 45,
            name: "Exact Duplicate",
            key: "test-key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toMatchObject({
      id: 45,
      name: "Exact Duplicate",
    })
  })

  it("passes through non-hidden-key non-matches", async () => {
    const service = createService({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 46,
            name: "Different Key",
            key: "test-other-key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    })

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })
})
