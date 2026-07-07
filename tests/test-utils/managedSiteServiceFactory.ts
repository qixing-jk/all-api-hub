import { vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteService } from "~/services/managedSites/managedSiteService"

const buildManagedSiteRuntimeConfig = (
  overrides: Record<string, unknown> = {},
) => ({
  baseUrl: "https://managed.example",
  adminToken: "managed-admin-token",
  userId: "1",
  ...overrides,
})

export const createManagedSiteServiceStub = (
  overrides: Record<string, unknown> = {},
) =>
  ({
    siteType: SITE_TYPES.NEW_API,
    messagesKey: "newapi",
    searchChannel: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    }),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    listChannels: vi.fn().mockResolvedValue([]),
    checkValidConfig: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue(buildManagedSiteRuntimeConfig()),
    fetchSiteUserGroups: vi.fn().mockResolvedValue([]),
    fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
    fetchAvailableModels: vi.fn(),
    buildChannelName: vi.fn(),
    prepareChannelFormData: vi.fn().mockResolvedValue({
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
    buildChannelPayload: vi.fn(),
    hydrateComparableChannelKeys: vi.fn(
      async (_config, candidates) => candidates,
    ),
    ...overrides,
  }) as unknown as ManagedSiteService
