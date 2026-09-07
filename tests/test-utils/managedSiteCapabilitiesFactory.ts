import { vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"

type CapabilityOverrides = Partial<
  Pick<ManagedSiteCapabilities, "siteType">
> & {
  matching?: Partial<ManagedSiteCapabilities["matching"]>
  config?: Partial<ManagedSiteCapabilities["config"]>
  queries?: ManagedSiteCapabilities["queries"]
  channelDrafts?: Partial<ManagedSiteCapabilities["channelDrafts"]>
}

/** Builds only the registered capability seams used by managed-site workflows. */
export const createManagedSiteCapabilitiesStub = (
  overrides: CapabilityOverrides = {},
): ManagedSiteCapabilities => ({
  siteType: overrides.siteType ?? SITE_TYPES.NEW_API,
  matching: {
    search: vi.fn().mockResolvedValue({ items: [], total: 0, type_counts: {} }),
    hydrateComparableKeys: vi.fn(async (_config, candidates) => candidates),
    ...overrides.matching,
  },
  config: {
    checkValid: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue({
      baseUrl: "https://managed.example",
      adminToken: "managed-admin-token",
      userId: "1",
    }),
    ...overrides.config,
  },
  queries: overrides.queries ?? {
    siteUserGroups: { fetch: vi.fn().mockResolvedValue([]) },
    accountAvailableModels: { fetch: vi.fn().mockResolvedValue([]) },
  },
  channelDrafts: {
    prepareFormData: vi.fn().mockResolvedValue({
      name: "Managed Channel",
      type: 1,
      key: "test-token-key",
      base_url: "https://api.example.com",
      models: ["gpt-4o"],
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 1,
    }),
    ...overrides.channelDrafts,
  },
})
