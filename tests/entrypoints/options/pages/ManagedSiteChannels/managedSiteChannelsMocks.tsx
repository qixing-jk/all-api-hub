import { vi } from "vitest"

import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

/**
 * Shared mock declarations for the ManagedSiteChannels page tests. Every
 * split test file must side-effect import this module as its FIRST import so
 * the hoisted vi.mock registrations apply to that test module graph.
 */
const {
  mockFetchChannelFilters,
  mockStartProductAnalyticsAction,
  mockTrackProductAnalyticsActionStarted,
  mockTrackProductAnalyticsActionCompleted,
  mockCompleteProductAnalyticsAction,
  mockResolveManagedUpstreamResourceCapabilities,
  mockWithProtectionBypassUserCommand,
} = vi.hoisted(() => ({
  mockFetchChannelFilters: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockTrackProductAnalyticsActionStarted: vi.fn(),
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
  mockResolveManagedUpstreamResourceCapabilities: vi.fn(),
  mockWithProtectionBypassUserCommand: vi.fn(
    async (command, surface, work) =>
      await work(userCommandExecution(command, surface)),
  ),
}))

export {
  mockStartProductAnalyticsAction,
  mockTrackProductAnalyticsActionStarted,
  mockTrackProductAnalyticsActionCompleted,
  mockCompleteProductAnalyticsAction,
  mockResolveManagedUpstreamResourceCapabilities,
  mockWithProtectionBypassUserCommand,
}

vi.mock("~/services/models/modelSync/messaging", () => ({
  sendModelSyncMessage: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn() },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: { convertToDisplayData: vi.fn((accounts) => accounts) },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      listProfiles: vi.fn(),
    },
  }),
)

vi.mock("~/services/managedSites/managedSiteService", async (importActual) => {
  const actual = (await importActual()) as any
  return {
    ...actual,
    getManagedSiteService: vi.fn(),
    getManagedSiteServiceForType: vi.fn(),
  }
})

vi.mock(
  "~/services/managedSites/providers/newApiSession",
  async (importActual) => {
    const actual = (await importActual()) as any
    return {
      ...actual,
      ensureNewApiManagedSession: vi.fn(),
      fetchNewApiChannelKey: vi.fn(),
      isNewApiVerifiedSessionActive: vi.fn(),
    }
  },
)

vi.mock("~/contexts/UserPreferencesContext", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, useUserPreferencesContext: vi.fn() }
})

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: vi.fn(),
}))

vi.mock("~/utils/navigation", async (importActual) => {
  const actual = (await importActual()) as any
  return {
    ...actual,
    navigateWithinOptionsPage: vi.fn(),
    openSettingsTab: vi.fn(),
    pushWithinOptionsPage: vi.fn(),
  }
})

vi.mock("~/utils/browser/browserApi", async (importActual) => {
  const actual =
    await importActual<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, createTab: vi.fn() }
})

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: mockWithProtectionBypassUserCommand,
}))

vi.mock("~/features/ManagedSiteChannels/utils/channelFilters", async () => ({
  fetchChannelFilters: mockFetchChannelFilters,
  saveChannelFilters: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    mockStartProductAnalyticsAction(...args),
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    mockTrackProductAnalyticsActionCompleted(...args),
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    mockTrackProductAnalyticsActionStarted(...args),
}))

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceCapabilities: (...args: unknown[]) =>
    mockResolveManagedUpstreamResourceCapabilities(...args),
}))
