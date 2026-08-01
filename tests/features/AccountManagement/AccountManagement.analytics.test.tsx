import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import AccountManagement from "~/features/AccountManagement/AccountManagement"
import {
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_STATUSES,
} from "~/features/UnifiedApiGuidance"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import { AuthTypeEnum } from "~/types"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const openAddAccountMock = vi.fn()
const handleRefreshMock = vi.fn()
const handleRefreshDisabledAccountsMock = vi.fn()
const handleOpenExternalCheckInsMock = vi.fn()
const pushWithinOptionsPageMock = vi.hoisted(() => vi.fn())
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
}))
const toastPromiseMock = vi.hoisted(() => vi.fn())
const {
  startProductAnalyticsActionMock,
  trackProductAnalyticsEventMock,
  trackerCompleteMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsEventMock: vi.fn(),
  trackerCompleteMock: vi.fn(),
}))
const accountDataContextState = vi.hoisted(() => ({
  current: {
    displayData: [] as any[],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  },
}))

type UserPreferencesContextMockState = {
  current: {
    preferences: UserPreferences | null
    managedSiteType: ManagedSiteType
    dismissGatewayGuidanceSurface?: (surface: string) => Promise<unknown>
  }
}

const userPreferencesContextState = vi.hoisted<UserPreferencesContextMockState>(
  () => ({
    current: {
      preferences: null,
      managedSiteType: "new-api" as ManagedSiteType,
    },
  }),
)
const dismissGatewayGuidanceSurfaceMock = vi.hoisted(() => vi.fn())
const apiCredentialProfilesState = vi.hoisted(() => ({
  current: {
    profiles: [] as unknown[],
    isLoading: false,
  },
}))

const keyAccessibleAccount = (id = "account-1") => ({
  id,
  disabled: false,
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://relay.example.invalid",
  userId: "user-1",
  token: "redacted-token",
  authType: AuthTypeEnum.AccessToken,
})

vi.mock("react-hot-toast", () => ({
  default: {
    promise: toastPromiseMock,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mockLogger,
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    ...accountDataContextState.current,
    handleRefresh: handleRefreshMock,
    handleRefreshDisabledAccounts: handleRefreshDisabledAccountsMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: handleOpenExternalCheckInsMock,
  }),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles",
  () => ({
    useApiCredentialProfiles: () => ({
      ...apiCredentialProfilesState.current,
      reload: vi.fn(),
      createProfile: vi.fn(),
      updateProfile: vi.fn(),
      deleteProfile: vi.fn(),
    }),
  }),
)

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => userPreferencesContextState.current,
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/services/productAnalytics/dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/dispatch")
    >()

  return {
    ...actual,
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: pushWithinOptionsPageMock,
  }
})

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/AccountManagement/components/DedupeAccountsDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>DedupeAccountsDialog</div> : null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.sessionStorage?.clear()
  trackerCompleteMock.mockResolvedValue(undefined)
  startProductAnalyticsActionMock.mockReturnValue({
    complete: trackerCompleteMock,
  })
  trackProductAnalyticsEventMock.mockResolvedValue(true)
  userPreferencesContextState.current = {
    preferences: null,
    managedSiteType: SITE_TYPES.NEW_API,
  }
  accountDataContextState.current = {
    displayData: [],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  }
  apiCredentialProfilesState.current = {
    profiles: [],
    isLoading: false,
  }
  handleRefreshMock.mockResolvedValue({
    success: 0,
    failed: 0,
    latestSyncTime: 0,
    refreshedCount: 0,
  })
  handleRefreshDisabledAccountsMock.mockResolvedValue({
    processedCount: 0,
    failedCount: 0,
    reEnabledCount: 0,
    latestSyncTime: 0,
  })
  toastPromiseMock.mockImplementation(async (promise: Promise<unknown>) => {
    return await promise
  })
})

describe("AccountManagement unified API guidance", () => {
  it("opens the add-account dialog instead of navigating for add-account guidance", () => {
    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.actions.addAccount",
      }),
    )

    expect(openAddAccountMock).toHaveBeenCalledTimes(1)
    expect(pushWithinOptionsPageMock).not.toHaveBeenCalled()
  })

  it("renders managed-site guidance for existing accounts and tracks configure navigation safely", async () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [keyAccessibleAccount()],
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.getByText("account:unifiedApiGuidance.headline"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "account:unifiedApiGuidance.description.needs_managed_site",
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.actions.configureManagedSite",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#basic", {
      tab: "managedSite",
      anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      highlight: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
    })
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementUnifiedApiGuidance,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.BASIC,
        route_params_present: true,
        guidance_status: UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
        guidance_action_kind:
          UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
      },
    )
    expect(trackProductAnalyticsEventMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tab: "managedSite",
      }),
    )
  })

  it("uses saved credential profiles for profile-ready guidance and analytics", () => {
    userPreferencesContextState.current = {
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastUpdated: 1,
        newApi: {
          ...DEFAULT_PREFERENCES.newApi,
          baseUrl: "https://managed.example.invalid",
          adminToken: "redacted-admin-token",
          userId: "1",
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
    }
    apiCredentialProfilesState.current = {
      profiles: [
        {
          id: "profile-1",
          name: "Profile",
          apiType: "openai-compatible",
          baseUrl: "https://api.example.invalid",
          apiKey: "redacted-api-key",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      isLoading: false,
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.getByText("account:unifiedApiGuidance.description.ready_profiles"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("account:unifiedApiGuidance.sources.profile"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.actions.openApiCredentialProfiles",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      "#apiCredentialProfiles",
      {},
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementUnifiedApiGuidance,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
        route_params_present: false,
        guidance_status: UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
        guidance_action_kind:
          UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
      },
    )
  })

  it("routes account-ready guidance to a specific account key import target", () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [
        { ...keyAccessibleAccount("disabled-account"), disabled: true },
        keyAccessibleAccount("enabled-account"),
      ],
    }
    userPreferencesContextState.current = {
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastUpdated: 1,
        newApi: {
          ...DEFAULT_PREFERENCES.newApi,
          baseUrl: "https://managed.example.invalid",
          adminToken: "redacted-admin-token",
          userId: "1",
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.actions.addGatewayChannel",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#keys", {
      accountId: "enabled-account",
      guidedImport: "managedSite",
    })
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementUnifiedApiGuidance,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.KEYS,
        route_params_present: true,
        guidance_status: UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
        guidance_action_kind:
          UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel,
      },
    )
  })

  it("hides account gateway guidance after gateway onboarding has completed once", () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "account-1", disabled: false }],
    }
    userPreferencesContextState.current = {
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastUpdated: 1,
        gatewayGuidance: {
          onboardingCompletedAt: 1,
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.queryByText("account:unifiedApiGuidance.headline"),
    ).not.toBeInTheDocument()
  })

  it("temporarily hides account gateway guidance without writing preferences", () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "account-1", disabled: false }],
    }
    userPreferencesContextState.current = {
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastUpdated: 1,
        gatewayGuidance: {},
      },
      managedSiteType: SITE_TYPES.NEW_API,
      dismissGatewayGuidanceSurface: dismissGatewayGuidanceSurfaceMock,
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.getByText("account:unifiedApiGuidance.headline"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.dismissForSession",
      }),
    )

    expect(
      screen.queryByText("account:unifiedApiGuidance.headline"),
    ).not.toBeInTheDocument()
    expect(dismissGatewayGuidanceSurfaceMock).not.toHaveBeenCalled()
  })

  it("permanently dismisses account gateway guidance for the account surface", async () => {
    dismissGatewayGuidanceSurfaceMock.mockResolvedValueOnce({
      ok: true,
      preferences: {
        ...DEFAULT_PREFERENCES,
        gatewayGuidance: {
          dismissedAtBySurface: {
            account: 1,
          },
        },
      },
    })
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "account-1", disabled: false }],
    }
    userPreferencesContextState.current = {
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastUpdated: 1,
        gatewayGuidance: {},
      },
      managedSiteType: SITE_TYPES.NEW_API,
      dismissGatewayGuidanceSurface: dismissGatewayGuidanceSurfaceMock,
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.permanentlyDismiss",
      }),
    )

    expect(
      screen.getByRole("dialog", {
        name: "account:unifiedApiGuidance.dismissDialog.title",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.dismissDialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(dismissGatewayGuidanceSurfaceMock).toHaveBeenCalledWith("account")
    })
  })

  it("shows a safe local error when permanent dismissal is not saved", async () => {
    dismissGatewayGuidanceSurfaceMock.mockResolvedValueOnce({
      ok: false,
      error: "sensitive backend detail",
    })
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "account-1", disabled: false }],
    }
    userPreferencesContextState.current = {
      preferences: {
        ...DEFAULT_PREFERENCES,
        lastUpdated: 1,
        gatewayGuidance: {},
      },
      managedSiteType: SITE_TYPES.NEW_API,
      dismissGatewayGuidanceSurface: dismissGatewayGuidanceSurfaceMock,
    }

    render(<AccountManagement />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.permanentlyDismiss",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.dismissDialog.confirm",
      }),
    )

    expect(
      await screen.findByRole("alert", {
        name: "messages:toast.error.saveFailed",
      }),
    ).toBeVisible()
    expect(
      screen.queryByText("sensitive backend detail"),
    ).not.toBeInTheDocument()
  })
})

describe("AccountManagement refresh analytics", () => {
  it("completes global refresh with safe count insights", async () => {
    handleRefreshMock.mockResolvedValueOnce({
      success: 2,
      failed: 1,
      latestSyncTime: 0,
      refreshedCount: 2,
    })

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.refresh" }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAllAccounts,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 3,
            successCount: 2,
            failureCount: 1,
          },
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            },
            outcome: {
              itemCount: 3,
              successCount: 2,
              failureCount: 1,
              skippedCount: 1,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            },
          },
        },
      )
    })
  })

  it("completes disabled-account refresh with safe count insights", async () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "disabled-1", disabled: true }],
    }
    handleRefreshDisabledAccountsMock.mockResolvedValueOnce({
      processedCount: 3,
      failedCount: 1,
      reEnabledCount: 1,
      latestSyncTime: 0,
    })

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:actions.refreshDisabledAccounts",
      }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshDisabledAccounts,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 3,
            successCount: 2,
            failureCount: 1,
          },
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            },
            outcome: {
              itemCount: 3,
              successCount: 2,
              failureCount: 1,
              skippedCount: 0,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            },
          },
        },
      )
    })
  })
})
