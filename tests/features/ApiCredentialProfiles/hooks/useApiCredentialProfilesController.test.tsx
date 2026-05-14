import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useApiCredentialProfilesController } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfilesController"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
} from "~/services/productAnalytics/events"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { act, renderHook } from "~~/tests/test-utils/render"

const {
  completeProductAnalyticsActionMock,
  createProfileMock,
  deleteProfileMock,
  refreshTelemetryMock,
  startProductAnalyticsActionMock,
  tagStorageListTagsMock,
  toastPromiseMock,
  updateProfileMock,
} = vi.hoisted(() => ({
  completeProductAnalyticsActionMock: vi.fn(),
  createProfileMock: vi.fn(),
  deleteProfileMock: vi.fn(),
  refreshTelemetryMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  tagStorageListTagsMock: vi.fn(),
  toastPromiseMock: vi.fn(),
  updateProfileMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    promise: (...args: unknown[]) => toastPromiseMock(...args),
    success: vi.fn(),
  },
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({ openWithCredentials: vi.fn() }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    claudeCodeRouterApiKey: "",
    claudeCodeRouterBaseUrl: "",
    cliProxyBaseUrl: "",
    cliProxyManagementKey: "",
    managedSiteType: "new-api",
  }),
}))

vi.mock("~/services/apiCredentialProfiles/telemetry", () => ({
  refreshApiCredentialProfileTelemetry: (...args: unknown[]) =>
    refreshTelemetryMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/services/managedSites/utils/managedSite", () => ({
  getManagedSiteLabel: () => "New API",
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    listTags: () => tagStorageListTagsMock(),
  },
}))

vi.mock("~/services/verification/verificationResultHistory", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/verification/verificationResultHistory")
  >("~/services/verification/verificationResultHistory")

  return {
    ...actual,
    useVerificationResultHistorySummaries: () => ({ summariesByKey: {} }),
  }
})

vi.mock("~/utils/browser/browserApi", async () => {
  const actual = await vi.importActual<
    typeof import("~/utils/browser/browserApi")
  >("~/utils/browser/browserApi")

  return {
    ...actual,
    onRuntimeMessage: () => () => {},
  }
})

vi.mock("~/utils/navigation", () => ({
  openModelsPage: vi.fn(),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles",
  () => ({
    useApiCredentialProfiles: () => ({
      createProfile: createProfileMock,
      deleteProfile: deleteProfileMock,
      isLoading: false,
      profiles: [],
      updateProfile: updateProfileMock,
    }),
  }),
)

function buildProfile(): ApiCredentialProfile {
  return {
    id: "profile-1",
    name: "Profile",
    apiType: "openai-compatible",
    baseUrl: "https://api.example.com",
    apiKey: "sk-profile",
    tagIds: [],
    notes: "",
    telemetryConfig: { mode: "auto" },
    createdAt: 1,
    updatedAt: 1,
  }
}

describe("useApiCredentialProfilesController", () => {
  beforeEach(() => {
    completeProductAnalyticsActionMock.mockReset()
    createProfileMock.mockReset()
    deleteProfileMock.mockReset()
    refreshTelemetryMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    tagStorageListTagsMock.mockReset()
    toastPromiseMock.mockReset()
    updateProfileMock.mockReset()
  })

  it("passes telemetry config through create and update flows", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    createProfileMock.mockResolvedValue(buildProfile())
    updateProfileMock.mockResolvedValue(buildProfile())

    const { result } = renderHook(() => useApiCredentialProfilesController(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await act(async () => {
      await result.current.handleSave({
        name: "Custom",
        apiType: "openai-compatible",
        baseUrl: "https://custom.example.com",
        apiKey: "sk-custom",
        tagIds: [],
        notes: "",
        telemetryConfig: {
          mode: "customReadOnlyEndpoint",
          customEndpoint: {
            endpoint: "/usage",
            jsonPaths: {
              balanceUsd: "data.balance",
            },
          },
        },
      })
    })

    expect(createProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetryConfig: {
          mode: "customReadOnlyEndpoint",
          customEndpoint: {
            endpoint: "/usage",
            jsonPaths: {
              balanceUsd: "data.balance",
            },
          },
        },
      }),
    )

    await act(async () => {
      await result.current.handleSave({
        id: "profile-1",
        name: "Disabled",
        apiType: "openai-compatible",
        baseUrl: "https://disabled.example.com",
        apiKey: "sk-disabled",
        tagIds: [],
        notes: "",
        telemetryConfig: { mode: "disabled" },
      })
    })

    expect(updateProfileMock).toHaveBeenCalledWith(
      "profile-1",
      expect.objectContaining({
        telemetryConfig: { mode: "disabled" },
      }),
    )
  })

  it("allows concurrent refreshes for different profiles and localizes errors", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    let resolveFirstRefresh: (() => void) | undefined
    let resolveSecondRefresh: (() => void) | undefined
    const firstRefreshPromise = new Promise<void>((resolve) => {
      resolveFirstRefresh = resolve
    }).then(() => ({
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1,
    }))
    const secondRefreshPromise = new Promise<void>((resolve) => {
      resolveSecondRefresh = resolve
    }).then(() => ({
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1,
    }))
    refreshTelemetryMock
      .mockReturnValueOnce(firstRefreshPromise)
      .mockReturnValueOnce(secondRefreshPromise)
    toastPromiseMock.mockImplementation(
      async (
        promise: Promise<unknown>,
        options: { error: (error: unknown) => string },
      ) => {
        expect(options.error(new Error("Profile not found."))).toBe(
          "apiCredentialProfiles:telemetry.messages.refreshFailed",
        )
        await promise
      },
    )

    const { result } = renderHook(() => useApiCredentialProfilesController(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    const firstProfile = buildProfile()
    const secondProfile = buildProfile()
    secondProfile.id = "profile-2"

    let firstRefresh!: Promise<void>
    let duplicateRefresh!: Promise<void>
    let secondRefresh!: Promise<void>
    await act(async () => {
      firstRefresh = result.current.handleRefreshTelemetry(firstProfile)
      duplicateRefresh = result.current.handleRefreshTelemetry(firstProfile)
      secondRefresh = result.current.handleRefreshTelemetry(secondProfile)
    })

    expect(refreshTelemetryMock).toHaveBeenCalledTimes(2)
    expect(refreshTelemetryMock).toHaveBeenNthCalledWith(1, "profile-1")
    expect(refreshTelemetryMock).toHaveBeenNthCalledWith(2, "profile-2")
    expect(result.current.refreshingTelemetryProfileIds).toEqual([
      "profile-1",
      "profile-2",
    ])

    await act(async () => {
      resolveFirstRefresh?.()
      await firstRefresh
      await duplicateRefresh
    })

    expect(result.current.refreshingTelemetryProfileIds).toEqual(["profile-2"])

    await act(async () => {
      resolveSecondRefresh?.()
      await secondRefresh
    })

    expect(result.current.refreshingTelemetryProfileIds).toEqual([])
  })

  it("completes telemetry refresh analytics from the async refresh outcome", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    refreshTelemetryMock.mockResolvedValue({
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1,
      source: "newApiTokenUsage",
      models: { count: 14, preview: [] },
      attempts: [
        { source: "models", endpoint: "/v1/models", status: "success" },
        {
          source: "newApiTokenUsage",
          endpoint: "/api/usage/token/",
          status: "success",
        },
      ],
      balanceUsd: 12,
    })
    toastPromiseMock.mockImplementation(async (promise: Promise<unknown>) => {
      await promise
    })

    const { result } = renderHook(() => useApiCredentialProfilesController(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await act(async () => {
      await result.current.handleRefreshTelemetry(buildProfile())
    })

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshApiCredentialTelemetry,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          telemetrySource: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          itemCount: 2,
          modelCount: 14,
          usageDataPresent: true,
        },
      },
    )
  })

  it("completes telemetry refresh analytics as unknown failure when refresh fails", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    refreshTelemetryMock.mockRejectedValue(new Error("Profile not found."))
    toastPromiseMock.mockImplementation(async (promise: Promise<unknown>) => {
      await promise
    })

    const { result } = renderHook(() => useApiCredentialProfilesController(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await act(async () => {
      await expect(
        result.current.handleRefreshTelemetry(buildProfile()),
      ).rejects.toThrow("Profile not found.")
    })

    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("completes telemetry refresh analytics as unknown failure for unsuccessful refresh snapshots", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    refreshTelemetryMock.mockResolvedValue({
      health: { status: SiteHealthStatus.Warning },
      lastSyncTime: 1,
    })
    toastPromiseMock.mockImplementation(async (promise: Promise<unknown>) => {
      await promise
    })

    const { result } = renderHook(() => useApiCredentialProfilesController(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await act(async () => {
      await result.current.handleRefreshTelemetry(buildProfile())
    })

    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
          usageDataPresent: false,
        },
      },
    )
  })

  it("skips telemetry refresh analytics for duplicate refreshes after starting a span", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    let resolveRefresh: (() => void) | undefined
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve
    }).then(() => {
      return {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 1,
      }
    })
    refreshTelemetryMock.mockReturnValue(refreshPromise)
    toastPromiseMock.mockImplementation(async (promise: Promise<unknown>) => {
      await promise
    })

    const { result } = renderHook(() => useApiCredentialProfilesController(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    const profile = buildProfile()

    let firstRefresh!: Promise<void>
    let duplicateRefresh!: Promise<void>
    await act(async () => {
      firstRefresh = result.current.handleRefreshTelemetry(profile)
      duplicateRefresh = result.current.handleRefreshTelemetry(profile)
    })

    expect(startProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
    expect(refreshTelemetryMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRefresh?.()
      await firstRefresh
      await duplicateRefresh
    })
  })
})
