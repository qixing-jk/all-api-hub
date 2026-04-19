import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useApiCredentialProfilesController } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfilesController"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { act, renderHook } from "~~/tests/test-utils/render"

const {
  deleteProfileMock,
  refreshTelemetryMock,
  tagStorageListTagsMock,
  toastPromiseMock,
} = vi.hoisted(() => ({
  deleteProfileMock: vi.fn(),
  refreshTelemetryMock: vi.fn(),
  tagStorageListTagsMock: vi.fn(),
  toastPromiseMock: vi.fn(),
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
      createProfile: vi.fn(),
      deleteProfile: deleteProfileMock,
      isLoading: false,
      profiles: [],
      updateProfile: vi.fn(),
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
    createdAt: 1,
    updatedAt: 1,
  }
}

describe("useApiCredentialProfilesController", () => {
  it("allows concurrent refreshes for different profiles and localizes errors", async () => {
    tagStorageListTagsMock.mockResolvedValue([])
    let resolveFirstRefresh: (() => void) | undefined
    let resolveSecondRefresh: (() => void) | undefined
    const firstRefreshPromise = new Promise<void>((resolve) => {
      resolveFirstRefresh = resolve
    })
    const secondRefreshPromise = new Promise<void>((resolve) => {
      resolveSecondRefresh = resolve
    })
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
})
