import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import AccountDialog from "~/features/AccountManagement/components/AccountDialog"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { SPONSOR_CATALOG_SCHEMA_VERSION } from "~/features/AccountManagement/sponsors/constants"
import type { SponsorRecommendation } from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { ACCOUNT_POST_SAVE_WORKFLOW_STEPS } from "~/services/accounts/accountPostSaveWorkflow"
import { AuthTypeEnum } from "~/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockState,
  mockSetters,
  mockHandlers,
  mockCreateTag,
  mockRenameTag,
  mockDeleteTag,
  mockOpenEditAccount,
  mockSponsorRecommendationItems,
  mockUseSponsorRecommendations,
  mockOpenFullBookmarkManagerPage,
  mockOpenApiCredentialProfilesPage,
  mockOpenSiteSupportRequestPage,
  mockCreateApiCredentialProfile,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockSponsorRecommendationItems: [
    {
      id: "anyrouter",
      name: "AnyRouter",
      tagline: "Supported provider.",
      supportStatus: "supported",
      links: {
        primary: "https://anyrouter.example.com/register",
      },
      actions: {
        addAccount: {
          siteType: "anyrouter",
          siteUrl: "https://anyrouter.example.com",
          authType: "cookie",
        },
      },
      schemaVersion: 4,
      source: "bundled",
      rank: 1,
    },
  ] as SponsorRecommendation[],
  mockState: {
    url: "https://api.example.com",
    phase: "site-input",
    formSource: "manual",
    isDetecting: false,
    isDetectingSlow: false,
    isSaving: false,
    isFormValid: true,
    isAutoConfiguring: false,
    detectionError: null,
    isDetected: false,
    siteType: "unknown",
    authType: "access_token",
    currentTabUrl: null,
    draft: {
      siteName: "Example Site",
      username: "alice",
      accessToken: "secret-token",
      userId: "12",
      exchangeRate: "7.2",
      manualBalanceUsd: "",
      notes: "existing note",
      tagIds: [],
      excludeFromTotalBalance: false,
      checkIn: {
        enableDetection: false,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
        customCheckIn: {
          url: "",
          redeemUrl: "",
          openRedeemWithCheckIn: true,
          isCheckedInToday: false,
        },
      },
      siteType: "unknown",
      authType: "access_token",
      cookieAuthSessionCookie: "",
      sub2apiUseRefreshToken: false,
      sub2apiRefreshToken: "",
      sub2apiTokenExpiresAt: null,
    },
    checkIn: {
      enableDetection: false,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
      },
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
        isCheckedInToday: false,
      },
    },
    isImportingSub2apiSession: false,
    isManualBalanceUsdInvalid: false,
    showAccessToken: false,
    isImportingCookies: false,
    showCookiePermissionWarning: false,
    duplicateAccountWarning: {
      isOpen: false,
      siteUrl: "",
      existingAccountsCount: 0,
      existingUsername: "",
      existingUserId: "",
    },
    managedSiteConfigPrompt: {
      isOpen: false,
      managedSiteLabel: "",
      missingMessage: "",
    },
    aihubmixPostSaveKeyPrompt: {
      isOpen: false,
      accountName: "",
      isCreating: false,
    },
    postSaveOneTimeToken: null,
    postSaveSub2ApiAllowedGroups: null,
    postSaveSub2ApiAccount: null,
    postSaveSub2ApiDialogSessionId: null,
  } as any,
  mockSetters: {
    setSiteName: vi.fn(),
    setUsername: vi.fn(),
    setUserId: vi.fn(),
    setAccessToken: vi.fn(),
    setSub2apiRefreshToken: vi.fn(),
    setExchangeRate: vi.fn(),
    setManualBalanceUsd: vi.fn(),
    setShowAccessToken: vi.fn(),
    setNotes: vi.fn(),
    setTagIds: vi.fn(),
    setExcludeFromTotalBalance: vi.fn(),
    setCheckIn: vi.fn(),
    setSiteType: vi.fn(),
    setCookieAuthSessionCookie: vi.fn(),
    setAuthType: vi.fn(),
  },
  mockHandlers: {
    handleAutoDetect: vi.fn(),
    handleShowManualForm: vi.fn(),
    handleClose: vi.fn(),
    handleAutoConfig: vi.fn(),
    handleUrlChange: vi.fn(),
    handleClearUrl: vi.fn(),
    handleUseCurrentTabUrl: vi.fn(),
    handleSub2apiUseRefreshTokenChange: vi.fn(),
    handleImportSub2apiSession: vi.fn(),
    handleImportCookieAuthSessionCookie: vi.fn(),
    handleOpenCookiePermissionSettings: vi.fn(),
    handleSaveAccount: vi.fn(),
    handleDuplicateAccountWarningCancel: vi.fn(),
    handleDuplicateAccountWarningContinue: vi.fn(),
    handleManagedSiteConfigPromptClose: vi.fn(),
    handleOpenManagedSiteSettings: vi.fn(),
    handleAihubmixPostSaveKeyPromptCancel: vi.fn(),
    handleAihubmixPostSaveKeyPromptConfirm: vi.fn(),
    shouldDeferAccountSaveSuccess: vi.fn(),
    handlePostSaveOneTimeTokenClose: vi.fn(),
    handlePostSaveSub2ApiTokenDialogClose: vi.fn(),
    handlePostSaveSub2ApiTokenCreated: vi.fn(),
    getPostSaveSub2ApiDialogHandlers: vi.fn(),
  },
  mockCreateTag: vi.fn(),
  mockRenameTag: vi.fn(),
  mockDeleteTag: vi.fn(),
  mockOpenEditAccount: vi.fn(),
  mockUseSponsorRecommendations: vi.fn(),
  mockOpenFullBookmarkManagerPage: vi.fn(),
  mockOpenApiCredentialProfilesPage: vi.fn(),
  mockOpenSiteSupportRequestPage: vi.fn(),
  mockCreateApiCredentialProfile: vi.fn(),
  mockLoggerError: vi.fn(),
}))

function resetMockState() {
  const emptyDraft = createEmptyAccountDialogDraft()

  Object.assign(mockState, {
    url: "https://api.example.com",
    phase: ACCOUNT_DIALOG_PHASES.SITE_INPUT,
    formSource: ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
    isDetecting: false,
    isDetectingSlow: false,
    isSaving: false,
    isFormValid: true,
    isAutoConfiguring: false,
    detectionError: null,
    isDetected: false,
    siteType: emptyDraft.siteType,
    authType: AuthTypeEnum.AccessToken,
    currentTabUrl: null,
    draft: {
      ...emptyDraft,
      siteName: "Example Site",
      username: "alice",
      accessToken: "secret-token",
      userId: "12",
      exchangeRate: "7.2",
      notes: "existing note",
    },
    checkIn: emptyDraft.checkIn,
    isImportingSub2apiSession: false,
    isManualBalanceUsdInvalid: false,
    showAccessToken: false,
    isImportingCookies: false,
    showCookiePermissionWarning: false,
    duplicateAccountWarning: {
      isOpen: false,
      siteUrl: "",
      existingAccountsCount: 0,
      existingUsername: "",
      existingUserId: "",
    },
    managedSiteConfigPrompt: {
      isOpen: false,
      managedSiteLabel: "",
      missingMessage: "",
    },
    aihubmixPostSaveKeyPrompt: {
      isOpen: false,
      accountName: "",
      isCreating: false,
    },
    accountPostSaveWorkflowStep: ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    postSaveOneTimeToken: null,
    postSaveSub2ApiAllowedGroups: null,
    postSaveSub2ApiAccount: null,
    postSaveSub2ApiDialogSessionId: null,
  })
}

vi.mock("~/features/KeyManagement/components/AddTokenDialog", () => ({
  default: (props: {
    isOpen: boolean
    preSelectedAccountId?: string
    createPrefill?: Record<string, unknown>
    prefillNotice?: string
    showOneTimeKeyDialog?: boolean
  }) => (
    <div data-testid="post-save-add-token-dialog">
      <div data-testid="post-save-add-token-open">{String(props.isOpen)}</div>
      <div data-testid="post-save-add-token-account">
        {props.preSelectedAccountId}
      </div>
      <div data-testid="post-save-add-token-prefill">
        {JSON.stringify(props.createPrefill)}
      </div>
      <div data-testid="post-save-add-token-notice">{props.prefillNotice}</div>
      <div data-testid="post-save-add-token-one-time">
        {String(props.showOneTimeKeyDialog)}
      </div>
    </div>
  ),
}))

vi.mock("~/features/KeyManagement/components/OneTimeApiKeyDialog", () => ({
  OneTimeApiKeyDialog: (props: {
    isOpen: boolean
    token: { key?: string } | null
    saveAction?: {
      onSave: () => Promise<void>
    }
  }) => (
    <div data-testid="post-save-one-time-key-dialog">
      <div data-testid="post-save-one-time-key-open">
        {String(props.isOpen)}
      </div>
      <div data-testid="post-save-one-time-key-value">
        {props.token?.key ?? ""}
      </div>
      {props.saveAction ? (
        <button
          type="button"
          data-testid="post-save-one-time-key-save"
          onClick={() => props.saveAction?.onSave().catch(() => undefined)}
        >
          save
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) =>
        mockCreateApiCredentialProfile(...args),
    },
  }),
)

vi.mock("react-hot-toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-hot-toast")>()

  return {
    ...actual,
    default: {
      ...actual.default,
      success: vi.fn(),
      error: vi.fn(),
    },
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    displayData: [],
    detectedSiteAccounts: [],
    detectedAccount: null,
    tags: [],
    tagCountsById: {},
    createTag: mockCreateTag,
    renameTag: mockRenameTag,
    deleteTag: mockDeleteTag,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openEditAccount: mockOpenEditAccount,
  }),
}))

vi.mock("~/contexts/ReleaseUpdateStatusContext", () => ({
  ReleaseUpdateStatusProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useUserPreferencesContext: () => ({
    managedSiteType: SITE_TYPES.NEW_API,
    themeMode: "light",
    updateThemeMode: vi.fn(),
  }),
}))

vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorRecommendations",
  () => ({
    useSponsorRecommendations: mockUseSponsorRecommendations,
  }),
)

vi.mock(
  "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog",
  () => ({
    useAccountDialog: () => ({
      state: mockState,
      setters: mockSetters,
      handlers: mockHandlers,
    }),
  }),
)

vi.mock("~/utils/navigation", () => ({
  openFullBookmarkManagerPage: mockOpenFullBookmarkManagerPage,
  openApiCredentialProfilesPage: mockOpenApiCredentialProfilesPage,
  openSiteSupportRequestPage: mockOpenSiteSupportRequestPage,
}))

describe("AccountDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    resetMockState()
    mockSponsorRecommendationItems.splice(
      0,
      mockSponsorRecommendationItems.length,
      {
        id: "anyrouter",
        name: "AnyRouter",
        tagline: "Supported provider.",
        supportStatus: "supported",
        links: {
          primary: "https://anyrouter.example.com/register",
        },
        actions: {
          addAccount: {
            siteType: SITE_TYPES.ANYROUTER,
            siteUrl: "https://anyrouter.example.com",
            authType: AuthTypeEnum.Cookie,
          },
        },
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        source: "bundled",
        rank: 1,
      },
    )
    mockHandlers.shouldDeferAccountSaveSuccess.mockReturnValue(false)
    mockCreateApiCredentialProfile.mockResolvedValue({
      id: "profile-1",
      name: "AIHubMix - Default API Key",
      apiType: "openai-compatible",
      baseUrl: "https://aihubmix.com",
      apiKey: "sk-one-time",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    mockUseSponsorRecommendations.mockImplementation(() => ({
      isLoading: false,
      items: mockSponsorRecommendationItems,
    }))
  })

  it("hides the form before the dialog reaches the account-form phase", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await screen.findByLabelText("accountDialog:siteInfo.siteUrl")
    expect(
      screen.queryByTestId("account-management-site-name-input"),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByTestId("account-management-auth-type-trigger"),
    ).toBeInTheDocument()
  })

  it("renders the account form after entering the account-form phase", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByTestId("account-management-site-name-input"),
    ).toBeInTheDocument()
  })

  it("does not show the entry auth selector in edit mode", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await screen.findByLabelText("accountDialog:siteInfo.siteUrl")
    expect(
      screen.queryByTestId("account-management-auth-type-trigger"),
    ).not.toBeInTheDocument()
  })

  it("renders sponsor recommendations only in add-mode site input", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    const { unmount } = render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations,
      ),
    ).toBeInTheDocument()

    unmount()
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM

    const accountFormRender = render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()

    accountFormRender.unmount()
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()
  })

  it("disables sponsor recommendations outside the add-account entry phase", () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED

    const accountFormRender = render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(mockUseSponsorRecommendations).toHaveBeenLastCalledWith({
      surface: "add-account-dialog",
      enabled: false,
    })

    accountFormRender.unmount()
    mockUseSponsorRecommendations.mockClear()
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(mockUseSponsorRecommendations).toHaveBeenLastCalledWith({
      surface: "add-account-dialog",
      enabled: false,
    })
  })

  it("prefills url and site type when continuing a supported sponsor", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(mockHandlers.handleUrlChange).toHaveBeenCalledWith(
      "https://anyrouter.example.com",
      { applyAuthDefault: false },
    )
    expect(mockSetters.setSiteType).toHaveBeenCalledWith(SITE_TYPES.ANYROUTER)
    expect(mockSetters.setAuthType).toHaveBeenCalledWith(AuthTypeEnum.Cookie)
    expect(openSpy).toHaveBeenCalledWith(
      "https://anyrouter.example.com/register",
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("applies profile default auth when continuing a sponsor without explicit auth", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("open", vi.fn())
    mockSponsorRecommendationItems[0] = {
      ...mockSponsorRecommendationItems[0],
      actions: {
        addAccount: {
          siteType: SITE_TYPES.ANYROUTER,
          siteUrl: "https://anyrouter.top",
        },
      },
    }
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(mockHandlers.handleUrlChange).toHaveBeenCalledWith(
      "https://anyrouter.top",
      { applyAuthDefault: false },
    )
    expect(mockSetters.setSiteType).toHaveBeenCalledWith(SITE_TYPES.ANYROUTER)
    expect(mockSetters.setAuthType).toHaveBeenCalledWith(AuthTypeEnum.Cookie)
  })

  it("shows the selected sponsor post-click note below the site URL helpers", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("open", vi.fn())
    mockSponsorRecommendationItems[0] = {
      ...mockSponsorRecommendationItems[0],
      postClickNote: "充值时输入 APIHUB 可查看服务商活动。",
    }
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPostClickNote),
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPostClickNote),
    ).toHaveTextContent("充值时输入 APIHUB 可查看服务商活动。")
  })

  it("opens sponsor fallback destinations from add-mode site input", async () => {
    const user = userEvent.setup()
    mockSponsorRecommendationItems.splice(
      0,
      mockSponsorRecommendationItems.length,
      {
        id: "manual-provider",
        name: "Manual Provider",
        tagline: "Needs manual setup.",
        supportStatus: "unsupported",
        postClickNote: "充值时输入 APIHUB 可查看服务商活动。",
        links: {
          primary: "https://manual-provider.example.com/register",
        },
        actions: {
          bookmarkFallback: {
            url: "https://manual-provider.example.com",
          },
          apiCredentialProfileFallback: {
            baseUrl: "https://manual-provider.example.com",
            apiKeyCreateUrl:
              "https://manual-provider.example.com/dashboard/keys?aff=all-api-hub",
            apiKeyCreateHint: "充值时输入 APIHUB 可查看服务商活动。",
          },
        },
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        source: "bundled",
        rank: 1,
      },
    )
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction,
      ),
    )

    expect(mockOpenSiteSupportRequestPage).not.toHaveBeenCalled()
    expect(mockOpenFullBookmarkManagerPage).toHaveBeenCalledWith({
      create: {
        name: "Manual Provider",
        url: "https://manual-provider.example.com",
      },
    })
    expect(mockOpenApiCredentialProfilesPage).toHaveBeenCalledWith({
      create: {
        name: "Manual Provider",
        baseUrl: "https://manual-provider.example.com",
        apiKeyCreateUrl:
          "https://manual-provider.example.com/dashboard/keys?aff=all-api-hub",
        apiKeyCreateHint: "充值时输入 APIHUB 可查看服务商活动。",
      },
    })
  })

  it("does not render sponsor recommendations when no items are available", () => {
    mockSponsorRecommendationItems.splice(0)
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()
  })

  it("renders the post-save Sub2API token dialog with default-token prefill", async () => {
    mockState.postSaveSub2ApiAccount = {
      id: "sub2-account-id",
      name: "Sub2API",
    }
    mockState.postSaveSub2ApiAllowedGroups = ["vip", "default"]
    mockState.postSaveSub2ApiDialogSessionId = 42
    mockHandlers.getPostSaveSub2ApiDialogHandlers.mockReturnValue({
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByTestId("post-save-add-token-dialog"),
    ).toBeInTheDocument()
    expect(screen.getByTestId("post-save-add-token-account")).toHaveTextContent(
      "sub2-account-id",
    )
    expect(screen.getByTestId("post-save-add-token-prefill")).toHaveTextContent(
      JSON.stringify({
        modelId: "",
        defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "default",
        allowedGroups: ["vip", "default"],
      }),
    )
    expect(screen.getByTestId("post-save-add-token-notice")).toHaveTextContent(
      "messages:tokenProvisioning.createRequiresGroupSelection",
    )
    expect(
      screen.getByTestId("post-save-add-token-one-time"),
    ).toHaveTextContent("false")
    expect(mockHandlers.getPostSaveSub2ApiDialogHandlers).toHaveBeenCalledWith(
      42,
    )
  })

  it("prefills the first allowed Sub2API group when default is unavailable", async () => {
    mockState.postSaveSub2ApiAccount = {
      id: "sub2-account-id",
      name: "Sub2API",
    }
    mockState.postSaveSub2ApiAllowedGroups = ["vip", "paid"]

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByTestId("post-save-add-token-prefill"),
    ).toHaveTextContent(
      JSON.stringify({
        modelId: "",
        defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "vip",
        allowedGroups: ["vip", "paid"],
      }),
    )
  })

  it("renders the post-save one-time key dialog only when a token is pending", async () => {
    mockState.postSaveOneTimeToken = {
      key: "sk-one-time",
    }

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByTestId("post-save-one-time-key-open"),
    ).toHaveTextContent("true")
    expect(
      screen.getByTestId("post-save-one-time-key-value"),
    ).toHaveTextContent("sk-one-time")
    expect(
      screen.getByTestId("post-save-one-time-key-save"),
    ).toBeInTheDocument()
  })

  it("saves an AIHubMix one-time key to API credential profiles without navigating", async () => {
    const user = userEvent.setup()
    mockState.draft.siteName = "AIHubMix"
    mockState.draft.tagIds = ["tag-a"]
    mockState.postSaveOneTimeToken = {
      id: 10,
      user_id: 13,
      key: "sk-one-time-full",
      name: "Default API Key",
      status: 1,
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    }
    mockCreateApiCredentialProfile.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - Default API Key",
      apiType: "openai-compatible",
      baseUrl: "https://aihubmix.com",
      apiKey: "sk-one-time-full",
      tagIds: ["tag-a"],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await user.click(await screen.findByTestId("post-save-one-time-key-save"))

    await waitFor(() => {
      expect(mockCreateApiCredentialProfile).toHaveBeenCalledWith({
        name: "AIHubMix - Default API Key",
        apiType: "openai-compatible",
        baseUrl: "https://aihubmix.com",
        apiKey: "sk-one-time-full",
        tagIds: ["tag-a"],
      })
    })
    expect(toast.success).toHaveBeenCalledWith(
      "keyManagement:messages.savedToApiProfiles",
    )
    expect(mockHandlers.handlePostSaveOneTimeTokenClose).not.toHaveBeenCalled()
    expect(mockOpenApiCredentialProfilesPage).not.toHaveBeenCalled()
  })

  it("keeps the AIHubMix one-time key dialog open when API profile save fails", async () => {
    const user = userEvent.setup()
    mockState.draft.siteName = "AIHubMix"
    mockState.postSaveOneTimeToken = {
      key: "sk-one-time-full",
      name: "Default API Key",
    }
    mockCreateApiCredentialProfile.mockRejectedValueOnce(
      new Error("storage failed for sk-one-time-full"),
    )

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await user.click(await screen.findByTestId("post-save-one-time-key-save"))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "keyManagement:messages.saveToApiProfilesFailed",
      )
    })
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to save one-time key to API profiles from AccountDialog",
      {
        message: "storage failed for [REDACTED]",
      },
    )
    expect(mockHandlers.handlePostSaveOneTimeTokenClose).not.toHaveBeenCalled()
  })

  it("renders the AIHubMix post-save key confirmation dialog", async () => {
    const user = userEvent.setup()
    mockState.aihubmixPostSaveKeyPrompt = {
      isOpen: true,
      accountName: "AIHubMix",
      isCreating: false,
    }

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByText("accountDialog:aihubmixDefaultKeyPrompt.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:aihubmixDefaultKeyPrompt.description"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.cancel",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.confirm",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.cancel",
      }),
    )
    expect(
      mockHandlers.handleAihubmixPostSaveKeyPromptCancel,
    ).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.confirm",
      }),
    )
    expect(
      mockHandlers.handleAihubmixPostSaveKeyPromptConfirm,
    ).toHaveBeenCalledTimes(1)
  })

  it("renders the AIHubMix key prompt creating state with disabled actions", async () => {
    const user = userEvent.setup()
    mockState.aihubmixPostSaveKeyPrompt = {
      isOpen: true,
      accountName: "AIHubMix",
      isCreating: true,
    }

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.creating",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.cancel",
      }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.cancel",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.creating",
      }),
    )

    expect(
      mockHandlers.handleAihubmixPostSaveKeyPromptCancel,
    ).not.toHaveBeenCalled()
    expect(
      mockHandlers.handleAihubmixPostSaveKeyPromptConfirm,
    ).not.toHaveBeenCalled()
  })

  it("calls onSuccess immediately when save success is not deferred", async () => {
    const onSuccess = vi.fn()
    const saveResult = {
      success: true,
      accountId: "regular-account",
      message: "Saved",
    }
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockHandlers.handleSaveAccount.mockResolvedValueOnce(saveResult)
    mockHandlers.shouldDeferAccountSaveSuccess.mockReturnValueOnce(false)

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={onSuccess}
        onError={vi.fn()}
      />,
    )

    const form = await screen.findByTestId("account-management-account-form")
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(saveResult)
    })
  })

  it("does not close the dialog immediately when save success is deferred for AIHubMix key creation", async () => {
    const onSuccess = vi.fn()
    const saveResult = {
      success: true,
      accountId: "aihubmix-account",
      message: "Saved",
    }
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockHandlers.handleSaveAccount.mockResolvedValueOnce(saveResult)
    mockHandlers.shouldDeferAccountSaveSuccess.mockReturnValueOnce(true)

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={onSuccess}
        onError={vi.fn()}
      />,
    )

    const form = await screen.findByTestId("account-management-account-form")
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

    expect(mockHandlers.handleSaveAccount).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(mockHandlers.shouldDeferAccountSaveSuccess).toHaveBeenCalledWith(
        saveResult,
      )
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
