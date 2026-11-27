import { fireEvent, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef, useState, type ComponentProps, type ReactNode } from "react"
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import AccountDialog, {
  type AccountDialogHandle,
} from "~/features/AccountManagement/components/AccountDialog"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import * as recoveryHandoff from "~/features/AccountManagement/components/AccountDialog/recovery/useAccountDialogRecoveryHandoff"
import { SPONSOR_CATALOG_SCHEMA_VERSION } from "~/features/AccountManagement/sponsors/constants"
import type { SponsorRecommendation } from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import toast from "~/lib/notify"
import enAccountDialog from "~/locales/en/accountDialog.json"
import { ACCOUNT_POST_SAVE_WORKFLOW_STEPS } from "~/services/accounts/accountPostSaveWorkflow"
import { CREATED_RUNTIME_SECRET_CORRELATION_KINDS as correlationKinds } from "~/services/accounts/keys/createdRuntimeSecret"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import * as siteRoutes from "~/services/accounts/utils/siteRouteResolver"
import { API_CREDENTIAL_PROFILE_CAPTURE_STATUSES } from "~/services/apiCredentialProfiles/links/contracts"
import {
  validateNewApiAccessToken,
  type NewApiAccessTokenValidationResult,
} from "~/services/apiService/newApiFamily/accessTokens/validation"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { AuthTypeEnum } from "~/types"
import * as browserUtils from "~/utils/browser"
import * as browserTabs from "~/utils/browser/tabs"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock(
  "~/services/apiService/newApiFamily/accessTokens/validation",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/newApiFamily/accessTokens/validation")
    >()),
    validateNewApiAccessToken: vi.fn(),
  }),
)
vi.mock(
  "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiTokenCreator",
  () => ({
    NewApiTokenCreator: ({
      onCreated,
    }: {
      onCreated: (token: string) => void
    }) => (
      <button type="button" onClick={() => onCreated("created-fixture-token")}>
        Use created fixture token
      </button>
    ),
  }),
)

const verifyEnteredToken = vi.mocked(validateNewApiAccessToken)

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: { getStatus: vi.fn().mockResolvedValue(null) },
}))
vi.mock("~/services/checkin/feedback/scan", async (original) => ({
  ...(await original<typeof import("~/services/checkin/feedback/scan")>()),
  collectCheckInFeedbackClues: vi
    .fn()
    .mockRejectedValue(new Error("unavailable")),
}))

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
  mockCaptureApiCredentialProfile,
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
    isLoadingAccount: false,
    accountLoadError: false,
    isDetecting: false,
    isDetectingSlow: false,
    isSaving: false,
    isFormValid: true,
    validationIssues: [],
    isAutoConfiguring: false,
    detectionError: null,
    openRouterBootstrapRecovery: null,
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
        automaticExecutionEnabled: true,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
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
      automaticExecutionEnabled: true,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
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
    postSaveOneTimeSecret: null,
    postSaveKeyInputAccount: null,
    postSaveKeyInputSessionId: null,
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
    retryAccountLoad: vi.fn(),
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
    handleRecoverCookieSession: vi.fn(),
    handleOpenCookiePermissionSettings: vi.fn(),
    handleSaveAccount: vi.fn(),
    handleDuplicateAccountWarningCancel: vi.fn(),
    handleDuplicateAccountWarningContinue: vi.fn(),
    handleManagedSiteConfigPromptClose: vi.fn(),
    handleOpenManagedSiteSettings: vi.fn(),
    handleAihubmixPostSaveKeyPromptCancel: vi.fn(),
    handleAihubmixPostSaveKeyPromptConfirm: vi.fn(),
    shouldDeferAccountSaveSuccess: vi.fn(),
    handlePostSaveOneTimeSecretClose: vi.fn(),
    handlePostSaveKeyProvisioningClose: vi.fn(),
    handlePostSaveKeyInputTokenDialogClose: vi.fn(),
    handlePostSaveKeyInputTokenCreated: vi.fn(),
    getPostSaveKeyInputDialogHandlers: vi.fn(),
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
  mockCaptureApiCredentialProfile: vi.fn(),
  mockLoggerError: vi.fn(),
}))

function resetMockState() {
  const emptyDraft = createEmptyAccountDialogDraft()

  Object.assign(mockState, {
    url: "https://api.example.com",
    phase: ACCOUNT_DIALOG_PHASES.SITE_INPUT,
    formSource: ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
    isLoadingAccount: false,
    accountLoadError: false,
    isDetecting: false,
    isDetectingSlow: false,
    isSaving: false,
    isFormValid: true,
    validationIssues: [],
    isAutoConfiguring: false,
    detectionError: null,
    cookieRecoveryState: null,
    openRouterBootstrapRecovery: null,
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
    postSaveOneTimeSecret: null,
    postSaveKeyInputAccount: null,
    postSaveKeyInputSessionId: null,
  })
  mockState.postSaveKeyProvisioning = null
}

vi.mock(
  "~/features/TokenProvisioning/creation/AccountKeyProvisioningDialog",
  () => ({
    AccountKeyProvisioningDialog: ({
      account,
      mode,
      onClose,
    }: {
      account: { name: string }
      mode: string
      onClose: () => void
    }) => (
      <button onClick={onClose}>
        Finish {account.name} {mode}
      </button>
    ),
  }),
)

vi.mock("~/features/TokenProvisioning/creation/AddTokenDialog", () => ({
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

vi.mock("~/services/apiCredentialProfiles/links", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiCredentialProfiles/links")
    >()

  return {
    ...actual,
    apiCredentialProfileLinks: {
      ...actual.apiCredentialProfileLinks,
      capture: async (input: { profile: unknown }) => {
        mockCaptureApiCredentialProfile(input)
        return {
          status: API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
          profile: await mockCreateApiCredentialProfile(input.profile),
        }
      },
    },
  }
})

vi.mock("~/lib/notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/notify")>()

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

vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts: [],
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

vi.mock("~/features/AccountManagement/dialogs/useDialogStateContext", () => ({
  useDialogStateContext: () => ({
    openEditAccount: mockOpenEditAccount,
  }),
  useAccountDialogActions: () => ({
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
  "~/features/AccountManagement/components/AccountDialog/workspace/useAccountDialog",
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
}))
vi.mock("~/utils/navigation/feedbackPages", () => ({
  openSiteSupportRequestPage: mockOpenSiteSupportRequestPage,
}))

describe("AccountDialog", () => {
  it("hands the popup Cookie recovery draft to a persistent editor before starting login", async () => {
    const continueRecovery = vi.fn()
    const popup = vi
      .spyOn(browserUtils, "isExtensionPopup")
      .mockReturnValue(true)
    const handoff = vi
      .spyOn(recoveryHandoff, "useAccountDialogRecoveryHandoff")
      .mockReturnValue({
        sidePanelSupported: true,
        isPending: false,
        disabled: false,
        errorMessage: null,
        onContinue: continueRecovery,
      })
    onTestFinished(() => {
      popup.mockRestore()
      handoff.mockRestore()
    })
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.ANYROUTER
    mockState.authType = AuthTypeEnum.Cookie
    mockState.draft = {
      ...mockState.draft,
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "",
      login: {
        methodId: "password",
        credentials: { username: "member", password: "unsaved" },
      },
    }
    mockState.cookieRecoveryState = {
      recoveryAction: "cookie",
      url: mockState.url,
      draft: mockState.draft,
      checkInSelectionChanged: false,
      checkInDiscoveryBaseSelection: null,
    }
    render(
      <AccountDialog
        isOpen
        mode={DIALOG_MODES.ADD}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "accountDialog:cookieValidation.recover",
      }),
    )
    expect(handoff).toHaveBeenLastCalledWith({
      enabled: true,
      state: mockState.cookieRecoveryState,
    })
    expect(continueRecovery).toHaveBeenCalledOnce()
    expect(mockHandlers.handleRecoverCookieSession).not.toHaveBeenCalled()
  })
  it("exposes the workspace close completion to its replacement owner", async () => {
    let finish!: () => void
    mockHandlers.handleClose.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const ref = createRef<AccountDialogHandle>()
    render(
      <AccountDialog
        ref={ref}
        isOpen
        mode={DIALOG_MODES.ADD}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await waitFor(() => expect(ref.current).not.toBeNull())
    const settled = vi.fn()
    const completion = ref.current!.close().then(settled)
    expect(mockHandlers.handleClose).toHaveBeenCalledOnce()
    expect(settled).not.toHaveBeenCalled()
    await act(async () => {
      finish()
      await completion
    })
    expect(settled).toHaveBeenCalledOnce()
  })
  it("detects the entered site when the site form is submitted", async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    mockState.isFormValid = false
    mockHandlers.handleSaveAccount.mockRejectedValueOnce(
      new Error("Please fill in all account information"),
    )

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={onError}
      />,
    )

    const autoDetect = screen.getByRole("button", { name: /mode.autoDetect/ })
    expect(autoDetect).toHaveAttribute("type", "submit")
    await user.click(autoDetect)

    expect(onError).not.toHaveBeenCalled()
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
    expect(mockHandlers.handleAutoDetect).toHaveBeenCalledOnce()
  })

  it.each([
    { scenario: "empty URL", url: "   ", isDetecting: false },
    {
      scenario: "detection in progress",
      url: "https://example.com",
      isDetecting: true,
    },
  ])("ignores site form submission with $scenario", ({ url, isDetecting }) => {
    mockState.url = url
    mockState.isDetecting = isDetecting
    mockState.isFormValid = false

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    fireEvent.submit(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountForm),
    )

    expect(mockHandlers.handleAutoDetect).not.toHaveBeenCalled()
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
  })

  it("lets the saved account provisioning dialog complete its owning workflow", async () => {
    mockState.postSaveKeyProvisioning = {
      account: buildDisplaySiteData({ name: "Saved account" }),
      mode: "all-groups",
    }
    render(
      <AccountDialog
        isOpen
        mode={DIALOG_MODES.ADD}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Finish Saved account all-groups" }),
      )
    expect(
      mockHandlers.handlePostSaveKeyProvisioningClose,
    ).toHaveBeenCalledTimes(1)
  })
  beforeEach(() => {
    vi.resetAllMocks()
    verifyEnteredToken.mockImplementation(() => new Promise(() => {}))
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
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
    mockCaptureApiCredentialProfile.mockReset()
    mockUseSponsorRecommendations.mockImplementation(() => ({
      isLoading: false,
      items: mockSponsorRecommendationItems,
    }))
  })

  it.each(["same", "changed-url", "changed-user", "changed-site-type"])(
    "preserves editor history only for the original account: %s",
    async (scenario) => {
      const user = userEvent.setup()
      mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
      mockState.draft.userId = scenario === "changed-user" ? "99" : "12"
      if (scenario === "changed-site-type")
        mockState.draft.siteType = SITE_TYPES.NEW_API
      mockState.url =
        scenario === "changed-url"
          ? "https://other.example"
          : "https://api.example.com"
      vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue({
        perAccount: {
          edited: {
            accountId: "edited",
            accountName: "Private",
            status: "failed",
            reasonCode: "permission_denied",
            timestamp: 1,
          },
        },
      })
      render(
        <AccountDialog
          isOpen
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          onError={vi.fn()}
          mode={DIALOG_MODES.EDIT}
          account={buildDisplaySiteData({
            id: "edited",
            baseUrl: "https://api.example.com",
            userId: "12",
          })}
        />,
      )
      await user.click(
        screen.getByRole("button", {
          name: /accountDialog:checkInFeedback\.(request|feedback)/,
        }),
      )
      // First use loads the feedback dialog lazily; await that module boundary
      // before the form query starts its normal DOM-readiness timeout.
      await act(async () => {
        await vi.dynamicImportSettled()
      })
      await screen.findByLabelText("accountDialog:checkInFeedback.notes")
      await user.click(
        screen.getByText("accountDialog:checkInFeedback.preview"),
      )
      const report = (
        screen.getByLabelText(
          "accountDialog:checkInFeedback.fullReport",
        ) as HTMLTextAreaElement
      ).value
      expect(report).toContain(
        scenario === "same"
          ? `<th scope="row">execution</th><td>failed</td>`
          : `<th scope="row">execution record</th><td>not_linked</td>`,
      )
    },
  )

  it("waits for edit hydration before mounting editable account fields", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.isLoadingAccount = true
    const props = {
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      account: buildDisplaySiteData(),
      focusSection: "check-in" as const,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    }
    const view = render(<AccountDialog {...props} />)
    expect(
      await screen.findByTestId("account-dialog-loading"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("account-dialog-loading").querySelector("svg"),
    ).toBeNull()
    expect(
      screen.queryByTestId("account-management-site-name-input"),
    ).not.toBeInTheDocument()

    // jsdom does not implement scrolling; keep the real section-navigation effect.
    const scroller = screen
      .getByTestId("account-dialog-loading")
      .closest<HTMLElement>('[data-slot="modal-body"]')!
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo
    view.rerender(<AccountDialog {...props} focusSection="account-auth" />)
    expect(scrollTo).not.toHaveBeenCalled()

    mockState.isLoadingAccount = false
    view.rerender(<AccountDialog {...props} />)
    expect(
      await screen.findByTestId("account-management-site-name-input"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("account-dialog-loading"),
    ).not.toBeInTheDocument()
  })

  it("disables saving an invalid loaded draft", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.isFormValid = false
    render(
      <AccountDialog
        isOpen
        mode={DIALOG_MODES.EDIT}
        account={buildDisplaySiteData()}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    expect(
      await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
    ).toBeDisabled()
  })

  it.each(
    [undefined, "error", "success"].flatMap((status) =>
      [false, true].map((incomplete) => ({ status, incomplete })),
    ),
  )(
    "requires matching AI/ML API verification before saving ($status, incomplete: $incomplete)",
    async ({ status, incomplete }) => {
      mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
      mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
      mockState.url = "https://aimlapi.com"
      mockState.siteType = SITE_TYPES.AIMLAPI
      if (incomplete) {
        mockState.draft.siteName = ""
        mockState.isFormValid = false
        mockState.validationIssues = [{ field: "siteName", kind: "missing" }]
      }
      Object.assign(mockState, {
        accessToken: mockState.draft.accessToken,
        userId: mockState.draft.userId,
        credentialVerification: status
          ? {
              status,
              aimlApiKey: mockState.draft.aimlApiKey,
              accessToken: mockState.draft.accessToken,
              siteType: mockState.siteType,
              userId: mockState.draft.userId,
            }
          : undefined,
      })
      onTestFinished(() => {
        Object.assign(mockState, { credentialVerification: undefined })
      })
      render(
        <AccountDialog
          isOpen
          mode={DIALOG_MODES.ADD}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />,
      )
      const save = await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton,
      )
      if (status === "success") expect(save).toBeEnabled()
      else expect(save).toBeDisabled()
    },
  )

  it("keeps a failed edit load out of the editable form and offers retry", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.accountLoadError = true
    const user = userEvent.setup()
    render(
      <AccountDialog
        isOpen
        mode={DIALOG_MODES.EDIT}
        account={buildDisplaySiteData()}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    expect(
      await screen.findByTestId("account-dialog-load-error"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("account-management-site-name-input"),
    ).not.toBeInTheDocument()
    const form = screen.getByTestId("account-management-account-form")
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
    })
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )
    expect(mockHandlers.retryAccountLoad).toHaveBeenCalledTimes(1)
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

  it.each([false, true])(
    "presents Requesty creation and pending labels (working: %s)",
    async (working) => {
      mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
      mockState.url = "https://app.requesty.ai/api-keys"
      mockState.accessToken = ""
      mockState.isDetecting = working
      render(
        <AccountDialog
          isOpen
          onClose={vi.fn()}
          mode={DIALOG_MODES.ADD}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />,
      )
      const button = await screen.findByRole("button", {
        name: working
          ? "accountDialog:mode.creatingManagementKey"
          : "accountDialog:mode.createManagementKey",
      })
      if (working) expect(button).toBeDisabled()
      else {
        await userEvent.setup().click(button)
        expect(mockHandlers.handleAutoDetect).toHaveBeenCalledOnce()
      }
      expect(
        screen.getByText("accountDialog:infoPanel.managementKeyBootstrapInfo"),
      ).toBeVisible()
    },
  )

  it("creates a Requesty key from the manual account form", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.REQUESTY
    mockState.url = "https://app.requesty.ai/api-keys"
    mockState.accessToken = ""
    mockState.draft.siteType = SITE_TYPES.REQUESTY
    mockState.draft.accessToken = ""
    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "accountDialog:form.autoCreateAccessToken",
      }),
    )
    expect(mockHandlers.handleAutoDetect).toHaveBeenCalledOnce()
  })

  it("presents canonical OpenRouter detection as Management Key creation", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.url = "https://openrouter.ai/settings/management-keys"

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
        name: "accountDialog:mode.createOpenRouterManagementKey",
      }),
    ).toBeEnabled()
  })

  it.each([
    ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
    ACCOUNT_DIALOG_FORM_SOURCES.DETECTED,
  ])(
    "uses the shared outline when adding an account (%s)",
    async (formSource) => {
      mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
      mockState.formSource = formSource

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
      expect(screen.getByRole("navigation")).toBeVisible()
      expect(
        screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo,
        ),
      ).toContainElement(
        screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
      )
      expect(screen.getByRole("note")).toHaveTextContent(
        formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
          ? "accountDialog:infoPanel.confirmAddInfo"
          : "accountDialog:infoPanel.manualInfo",
      )
    },
  )

  it("groups the site URL into the continuous edit form", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    expect(
      await screen.findByRole("navigation", {
        name: "accountDialog:sections.navigation",
      }),
    ).toBeVisible()
    const siteSection = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo,
    )
    expect(siteSection).toContainElement(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput),
    )
  })

  it("does not show manual guidance for completed OpenRouter provisioning", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    mockState.openRouterBootstrapRecovery = null

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await screen.findByTestId("account-management-site-name-input")
    expect(
      screen.queryByText("accountDialog:openrouterBootstrapRecovery.title"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "accountDialog:openrouterBootstrapRecovery.manualRevocation",
      ),
    ).not.toBeInTheDocument()
  })

  it("shows the recognizable label and manual guidance for created-key recovery", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    mockState.openRouterBootstrapRecovery = {
      message: "Review the created key",
      label: "OpenRouter extension created-recovery-request-placeholder",
      requiresManualRecovery: true,
    }

    testI18n.addResource(
      "en",
      "accountDialog",
      "openrouterBootstrapRecovery.label",
      enAccountDialog.openrouterBootstrapRecovery.label,
    )

    try {
      render(
        <AccountDialog
          isOpen={true}
          onClose={vi.fn()}
          mode={DIALOG_MODES.ADD}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />,
      )

      expect(await screen.findByText("Review the created key")).toBeVisible()
      expect(
        screen.getByText(
          enAccountDialog.openrouterBootstrapRecovery.label.replace(
            "{{label}}",
            "OpenRouter extension created-recovery-request-placeholder",
          ),
        ),
      ).toBeVisible()
      expect(
        screen.getByText(
          "accountDialog:openrouterBootstrapRecovery.manualRevocation",
        ),
      ).toBeInTheDocument()
    } finally {
      testI18n.removeResourceBundle("en", "accountDialog")
    }
  })

  it("shows manual guidance without manufacturing a missing recognizable label", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    mockState.openRouterBootstrapRecovery = {
      requiresManualRecovery: true,
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
      await screen.findByText(
        "accountDialog:openrouterBootstrapRecovery.manualRevocation",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("accountDialog:openrouterBootstrapRecovery.label"),
    ).not.toBeInTheDocument()
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

  it("keeps bookmark batch import out of the add-account entry phase", async () => {
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
      screen.queryByText("accountDialog:bookmarkImportBatch.prompt"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:bookmarkImportBatch.action",
      }),
    ).not.toBeInTheDocument()
  })

  it.each(["verification", "recovery"] as const)(
    "shows one provider credential guide during %s",
    async (kind) => {
      mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
      mockState.siteType = SITE_TYPES.VERCEL_AI_GATEWAY
      mockState.draft.siteType = SITE_TYPES.VERCEL_AI_GATEWAY
      mockState.draft.accessToken = ""
      mockState.detectionError =
        kind === "verification"
          ? {
              type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
              message: "Enter the missing credential",
            }
          : {
              type: AutoDetectErrorType.UNKNOWN,
              recoveryAction: "access_token",
              message: "Enter the missing credential",
            }
      render(
        <AccountDialog
          isOpen
          onClose={vi.fn()}
          mode={DIALOG_MODES.ADD}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />,
      )

      expect(
        await screen.findByText(
          "accountDialog:accessTokenVerification.vercel.generateStep",
        ),
      ).toBeVisible()
      expect(
        screen.queryByText("accountDialog:form.vercelAccessTokenGuidance"),
      ).not.toBeInTheDocument()
    },
  )

  it("retains provider credential instructions when only the generic recovery guide is available", () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.REQUESTY
    mockState.draft.siteType = SITE_TYPES.REQUESTY
    mockState.draft.accessToken = ""
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Enter the missing credential",
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
      screen.getByText("accountDialog:form.requestyManageKeyGuidance"),
    ).toBeInTheDocument()
  })

  it("reviews incomplete fields from Save without saving the account", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = ""
    mockState.draft.siteName = ""
    mockState.draft.accessToken = ""
    mockState.isFormValid = false
    mockState.validationIssues = [
      { field: "siteName", kind: "missing" },
      { field: "accessToken", kind: "missing" },
    ]
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Complete security verification on the site",
    }
    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    const siteName = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput,
    )
    await waitFor(() => expect(siteName).toHaveFocus())
    expect(
      screen.getAllByText("accountDialog:validation.missing"),
    ).toHaveLength(2)
    const user = userEvent.setup()
    const save = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton,
    )
    expect(save).toBeEnabled()
    expect(save).toHaveAttribute("type", "submit")
    await user.click(save)
    expect(siteName).toHaveAttribute("aria-invalid", "true")
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
    expect(siteName).toHaveFocus()
  })

  it("opens the compact token entry only when the token is the sole blocker", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Complete security verification on the site",
    }
    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )
    const token = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
    )
    await waitFor(() => expect(token).toHaveFocus())
    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
    ).not.toBeInTheDocument()
    expect(token).toHaveAttribute(
      "placeholder",
      "accountDialog:validation.pasteToken",
    )
    expect(token).toHaveAccessibleDescription(
      "accountDialog:validation.tokenFieldHint",
    )
    const actions = screen.getByRole("group", {
      name: "accountDialog:form.accessToken",
    })
    expect(actions.closest("form")).toBeNull()
    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    ).toHaveClass("hidden sm:inline-flex")
    expect(actions.parentElement).toHaveClass("w-full sm:w-auto")
    expect(actions).toHaveClass(
      "max-sm:w-full max-sm:flex-col-reverse max-sm:items-stretch",
    )
    expect(
      within(actions).getByRole("button", {
        name: "accountDialog:tokenCreation.openSite",
      }),
    ).toBeVisible()
    expect(
      within(actions).getByRole("button", {
        name: "accountDialog:tokenCreation.title",
      }),
    ).toBeVisible()
    expect(
      screen.getByText("accountDialog:validation.detectedAccountDetails"),
    ).toBeVisible()
    expect(screen.queryByText(/#12/)).not.toBeInTheDocument()

    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "accountDialog:validation.openFullForm",
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
      ).toHaveFocus(),
    )
    expect(
      screen.getByRole("group", { name: "accountDialog:form.accessToken" }),
    ).toBeInTheDocument()
    expect(
      screen
        .getByRole("group", { name: "accountDialog:form.accessToken" })
        .closest("form"),
    ).not.toBeNull()
    const authentication = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
    )
    const fullActions = within(authentication).getByRole("group", {
      name: "accountDialog:form.accessToken",
    })
    const authTrigger = within(authentication).getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger,
    )
    expect(
      authTrigger.closest('[data-slot="field"]')?.parentElement,
    ).toContainElement(fullActions.closest(".col-span-full"))
    expect(fullActions.closest('[data-slot="field"]')).toBeNull()
    expect(
      within(authentication).getByText(
        "accountDialog:tokenCreation.setupDescription",
      ),
    ).toBeVisible()
  })

  it("shows the full form with manual verification when detection has all required fields", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.SITE_INPUT
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.isDetecting = true
    const dialog = () => (
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />
    )
    const { rerender } = render(dialog())
    mockState.isDetecting = false
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    mockState.userId = mockState.draft.userId
    mockState.accessToken = "detected-token"
    mockState.draft.accessToken = "detected-token"
    rerender(dialog())

    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).toBeVisible()
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
    ).toHaveValue("detected-token")
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
    ).toBeEnabled()
    const verify = screen.getByRole("button", {
      name: "accountDialog:accessTokenValidation.verify",
    })
    expect(verify).toBeEnabled()
    expect(verifyEnteredToken).not.toHaveBeenCalled()
    verifyEnteredToken.mockResolvedValueOnce({ status: "valid" })
    await userEvent.setup().click(verify)
    expect(verifyEnteredToken).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessToken: "detected-token" }),
    )
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
  })

  function renderCompactTokenDialog(
    props: Partial<ComponentProps<typeof AccountDialog>> = {},
  ) {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Complete security verification on the site",
    }
    return renderEditableTokenDialog(props)
  }

  function renderEditableTokenDialog(
    props: Partial<ComponentProps<typeof AccountDialog>> = {},
  ) {
    function EditableAccountDialog() {
      const [, setToken] = useState("")
      mockSetters.setAccessToken.mockImplementation((value: string) => {
        mockState.accessToken = value
        mockState.draft.accessToken = value
        mockState.isFormValid = Boolean(value.trim())
        mockState.validationIssues = value.trim()
          ? []
          : [{ field: "accessToken", kind: "missing" }]
        setToken(value)
      })
      return (
        <AccountDialog
          isOpen
          onClose={vi.fn()}
          mode={DIALOG_MODES.ADD}
          onSuccess={vi.fn()}
          onError={vi.fn()}
          {...props}
        />
      )
    }
    const view = render(<EditableAccountDialog />)
    return {
      update: (changes: Partial<ComponentProps<typeof AccountDialog>> = {}) => {
        Object.assign(props, changes)
        view.rerender(<EditableAccountDialog />)
      },
    }
  }

  const accessTokenField = () =>
    screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput)
  const pasteToken = (value = "manual-token") =>
    fireEvent.paste(accessTokenField(), {
      clipboardData: { getData: () => value },
    })
  const saveAccount = () =>
    screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton)

  it("keeps compact token actions mounted when focus moves from the token field", () => {
    renderCompactTokenDialog()
    const token = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
    )
    const create = screen.getByRole("button", {
      name: "accountDialog:tokenCreation.title",
    })
    fireEvent.change(token, { target: { value: "manual-token" } })
    fireEvent.blur(token, { relatedTarget: create })
    expect(create).toBeVisible()
    expect(verifyEnteredToken).not.toHaveBeenCalled()
  })

  it("keeps a typed token when explicitly opening the full form from compact entry", async () => {
    renderCompactTokenDialog()
    const token = accessTokenField()
    const openFullForm = screen.getByRole("button", {
      name: "accountDialog:validation.openFullForm",
    })
    fireEvent.change(token, { target: { value: "manual-token" } })
    fireEvent.blur(token, { relatedTarget: openFullForm })
    fireEvent.click(openFullForm)
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).toBeVisible()
    expect(accessTokenField()).toHaveValue("manual-token")
    expect(verifyEnteredToken).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessToken: "manual-token" }),
    )
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
  })

  it("associates invalid balance and exchange rate feedback with their controls", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.draft.exchangeRate = "0"
    mockState.draft.manualBalanceUsd = "-1"
    mockState.isFormValid = false
    mockState.validationIssues = [
      { field: "exchangeRate", kind: "invalid" },
      { field: "manualBalanceUsd", kind: "invalid" },
    ]
    renderEditableTokenDialog()
    await userEvent.setup().click(saveAccount())
    const rate = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.exchangeRateInput,
    )
    const balance = screen.getByLabelText("accountDialog:form.manualBalanceUsd")
    expect(rate).toHaveAttribute("aria-invalid", "true")
    expect(rate).toHaveAccessibleDescription(
      /accountDialog:form.validRateError/,
    )
    expect(balance).toHaveAttribute("aria-invalid", "true")
    expect(balance).toHaveAccessibleDescription(
      /accountDialog:form.manualBalanceUsdError/,
    )
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
  })

  it.each(["paste", "pause", "blur", "enter"] as const)(
    "opens the full form and verifies the token on compact token %s",
    async (trigger) => {
      vi.useFakeTimers()
      onTestFinished(() => {
        vi.useRealTimers()
      })
      renderCompactTokenDialog()
      const token = screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
      )
      const heading = screen.getByRole("heading", {
        name: "accountDialog:validation.tokenNeeded",
      })
      expect(token).toHaveFocus()
      if (trigger === "paste") {
        pasteToken()
      } else {
        fireEvent.change(token, { target: { value: "manual-token" } })
        expect(heading).toBeVisible()
        expect(
          screen.getByRole("button", {
            name: "accountDialog:tokenCreation.title",
          }),
        ).toBeVisible()
        expect(
          screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton),
        ).not.toBeInTheDocument()
        if (trigger === "pause") {
          await act(() => vi.advanceTimersByTimeAsync(450))
          fireEvent.change(token, { target: { value: "" } })
          await act(() => vi.advanceTimersByTimeAsync(800))
          expect(heading).toBeVisible()
          fireEvent.change(token, { target: { value: "manual-token" } })
          await act(() => vi.advanceTimersByTimeAsync(799))
          expect(heading).toBeVisible()
          await act(() => vi.advanceTimersByTimeAsync(1))
        } else if (trigger === "blur") {
          fireEvent.blur(token)
        } else {
          fireEvent.keyDown(token, { key: "Enter" })
        }
      }

      expect(
        screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
      ).toHaveValue("Example Site")
      const fullTokenField = screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
      )
      expect(fullTokenField).toHaveValue("manual-token")
      if (trigger !== "blur") expect(fullTokenField).toHaveFocus()
      expect(
        screen.getByText("accountDialog:accessTokenValidation.checking"),
      ).toBeVisible()
      expect(verifyEnteredToken).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ accessToken: "manual-token", userId: "12" }),
      )
      expect(
        screen.queryByText("accountDialog:tokenCreation.complete"),
      ).not.toBeInTheDocument()
      expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
      fireEvent.change(fullTokenField, { target: { value: "" } })
      expect(
        screen.queryByText("accountDialog:accessTokenValidation.checking"),
      ).not.toBeInTheDocument()
      fireEvent.change(fullTokenField, { target: { value: "another-token" } })
      expect(
        screen.queryByText("accountDialog:accessTokenValidation.checking"),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: "accountDialog:accessTokenValidation.verify",
        }),
      ).toBeVisible()
    },
  )

  it.each([
    {
      status: "valid",
      copy: "valid",
      tone: "success",
      highlight: "border-success-border",
    },
    {
      status: "invalid",
      copy: "invalid",
      tone: "warning",
      highlight: "border-warning-text/65",
    },
    {
      status: "identity_mismatch",
      copy: "identityMismatch",
      tone: "warning",
      highlight: "border-warning-text/65",
    },
    {
      status: "unavailable",
      copy: "unavailable",
      tone: "neutral",
      highlight: "border-input",
    },
  ] as const)(
    "shows $status as advisory feedback under the token",
    async ({ status, copy, tone, highlight }) => {
      const pending = createDeferred<NewApiAccessTokenValidationResult>()
      verifyEnteredToken.mockReturnValueOnce(pending.promise)
      renderCompactTokenDialog()
      pasteToken()

      const input = accessTokenField()
      const checking = screen
        .getByText("accountDialog:accessTokenValidation.checking")
        .closest('[role="status"]')
      expect(checking).toHaveClass("text-xs")
      expect(checking?.querySelector('[data-slot="spinner"]')).toHaveClass(
        "size-3.5",
      )
      expect(input).toHaveAttribute("aria-busy", "true")
      const checkingButton = screen.getByRole("button", {
        name: "accountDialog:accessTokenValidation.checking",
      })
      expect(input.parentElement).toContainElement(checkingButton)
      expect(checkingButton).toBeDisabled()
      expect(checkingButton).toHaveAttribute("aria-busy", "true")
      expect(input).not.toHaveClass("border-destructive-border")
      expect(input).not.toHaveClass("border-warning-text/65")
      expect(input).not.toHaveClass("border-success-border")
      expect(
        screen.queryByRole("group", { name: "accountDialog:form.accessToken" }),
      ).not.toBeInTheDocument()
      expect(saveAccount()).toBeEnabled()
      const autoConfig = screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton,
      )
      expect(autoConfig).toBeEnabled()
      await act(() => pending.resolve({ status }))
      const feedback = screen.getByText(
        `accountDialog:accessTokenValidation.${copy}`,
      )
      const message = feedback.closest('[role="status"]')
      expect(message).toHaveAttribute("data-tone", tone)
      expect(message).toHaveClass("text-xs")
      expect(input.closest('[data-slot="field"]')).toContainElement(feedback)
      expect(input).toHaveClass(highlight)
      expect(input).not.toHaveClass("border-destructive-border")
      expect(input).not.toHaveAttribute("aria-invalid", "true")
      expect(input).not.toHaveAttribute("aria-busy")
      expect(saveAccount()).toBeEnabled()
      expect(autoConfig).toBeEnabled()
      const label =
        status === "valid"
          ? "verify"
          : status === "unavailable"
            ? "retry"
            : "verifyAgain"
      const button = screen.getByRole("button", {
        name: `accountDialog:accessTokenValidation.${label}`,
      })
      expect(input.parentElement).toContainElement(button)
      expect(button).toBeVisible()
      expect(button).toBeEnabled()
      expect(message?.querySelector("button")).toBeNull()
      const acquisition = screen.queryByRole("group", {
        name: "accountDialog:form.accessToken",
      })
      if (status === "invalid" || status === "identity_mismatch") {
        const bar = acquisition?.closest<HTMLElement>(".col-span-full") ?? null
        expect(bar).toBeVisible()
        const authentication = screen.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth,
        )
        expect(authentication).toContainElement(bar)
        expect(bar).toHaveTextContent(
          status === "invalid"
            ? "accountDialog:tokenCreation.replaceInvalidDescription"
            : "accountDialog:tokenCreation.replaceMismatchedDescription",
        )
        for (const key of [
          "openSite",
          "title",
          "manualSetup",
          "manualAddDocs",
        ]) {
          const action = screen.getByRole("button", {
            name: `accountDialog:tokenCreation.${key}`,
          })
          expect(bar).toContainElement(action)
          expect(action).toBeEnabled()
        }
      } else {
        expect(acquisition).not.toBeInTheDocument()
      }
    },
  )

  it.each([
    { entry: "compact Add", mode: DIALOG_MODES.ADD, compact: true },
    { entry: "manual Add", mode: DIALOG_MODES.ADD, compact: false },
    { entry: "Edit", mode: DIALOG_MODES.EDIT, compact: false },
  ])(
    "replaces an invalid token through the creator from $entry",
    async ({ mode, compact }) => {
      const user = userEvent.setup()
      verifyEnteredToken.mockResolvedValueOnce({ status: "invalid" })
      if (compact) {
        renderCompactTokenDialog()
        pasteToken("invalid-fixture-token")
      } else {
        mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
        mockState.siteType = SITE_TYPES.NEW_API
        mockState.draft.siteType = SITE_TYPES.NEW_API
        mockState.userId = mockState.draft.userId
        mockState.accessToken = "invalid-fixture-token"
        mockState.draft.accessToken = mockState.accessToken
        renderEditableTokenDialog({ mode })
        await user.click(
          screen.getByRole("button", {
            name: "accountDialog:accessTokenValidation.verify",
          }),
        )
      }

      const create = () =>
        screen.getByRole("button", {
          name: "accountDialog:tokenCreation.title",
        })
      const warning = "accountDialog:accessTokenValidation.invalid"
      await screen.findByText(warning)
      expect(saveAccount()).toBeEnabled()
      if (mode === DIALOG_MODES.ADD)
        expect(
          screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton),
        ).toBeEnabled()
      await user.click(create())
      expect(accessTokenField()).not.toBeVisible()
      await user.click(
        screen.getByRole("button", {
          name: "accountDialog:tokenCreation.backToAccount",
        }),
      )
      expect(accessTokenField()).toHaveFocus()
      expect(screen.getByText(warning)).toBeVisible()
      await user.click(create())
      await user.click(
        screen.getByRole("button", { name: "Use created fixture token" }),
      )

      expect(accessTokenField()).toHaveValue("created-fixture-token")
      expect(accessTokenField()).toHaveFocus()
      expect(screen.queryByText(warning)).not.toBeInTheDocument()
      expect(
        screen.queryByRole("group", { name: "accountDialog:form.accessToken" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByText("accountDialog:tokenCreation.complete"),
      ).toBeVisible()
      expect(verifyEnteredToken).toHaveBeenCalledOnce()
      expect(saveAccount()).toBeEnabled()
    },
  )

  it.each(["checking", "invalid"] as const)(
    "saves normally with %s advisory feedback",
    async (status) => {
      if (status === "invalid")
        verifyEnteredToken.mockResolvedValueOnce({ status })
      const onSuccess = vi.fn()
      const result = { success: true, accountId: "saved" }
      mockHandlers.handleSaveAccount.mockResolvedValueOnce(result)
      renderCompactTokenDialog({ onSuccess })
      pasteToken()
      await screen.findByText(`accountDialog:accessTokenValidation.${status}`)
      const signal = atIndex(verifyEnteredToken.mock.calls, 0)[0].abortSignal
      await userEvent.setup().click(saveAccount())
      expect(mockHandlers.handleSaveAccount).toHaveBeenCalledOnce()
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith(result)
      if (status === "checking") expect(signal?.aborted).toBe(true)
    },
  )

  it("focuses the token and shows site navigation failure in the rejected-token recovery bar", async () => {
    const user = userEvent.setup()
    const resolveRoute = vi
      .spyOn(siteRoutes, "resolveAccountSiteRouteUrl")
      .mockResolvedValue(null)
    onTestFinished(() => resolveRoute.mockRestore())
    verifyEnteredToken.mockResolvedValueOnce({ status: "invalid" })
    renderCompactTokenDialog()
    pasteToken()

    const siteAction = await screen.findByRole("button", {
      name: "accountDialog:tokenCreation.openSite",
    })
    await user.click(siteAction)

    expect(accessTokenField()).toHaveFocus()
    const warning = await screen.findByRole("alert")
    expect(siteAction.closest(".col-span-full")).toContainElement(warning)
    expect(warning).toHaveTextContent(
      "accountDialog:accessTokenVerification.openSecurityFailed",
    )
    expect(saveAccount()).toBeEnabled()
  })

  it("aborts on token edits, discards late results, and verifies the edited token manually", async () => {
    const pending = createDeferred<NewApiAccessTokenValidationResult>()
    verifyEnteredToken
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ status: "valid" })
    renderCompactTokenDialog()
    pasteToken()
    const signal = atIndex(verifyEnteredToken.mock.calls, 0)[0].abortSignal
    fireEvent.change(accessTokenField(), {
      target: { value: "replacement-token" },
    })
    expect(signal?.aborted).toBe(true)
    await act(() => pending.resolve({ status: "invalid" }))
    expect(
      screen.queryByText("accountDialog:accessTokenValidation.invalid"),
    ).not.toBeInTheDocument()
    expect(verifyEnteredToken).toHaveBeenCalledOnce()
    const verifyButton = screen.getByRole("button", {
      name: "accountDialog:accessTokenValidation.verify",
    })
    expect(accessTokenField().parentElement).toContainElement(verifyButton)
    expect(accessTokenField()).not.toHaveAttribute("aria-describedby")
    await userEvent.setup().click(verifyButton)
    expect(
      await screen.findByText("accountDialog:accessTokenValidation.valid"),
    ).toBeVisible()
    expect(verifyEnteredToken).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessToken: "replacement-token" }),
    )
  })

  it("retries a rejected token on demand and clears that check when the dialog closes", async () => {
    verifyEnteredToken.mockResolvedValueOnce({ status: "identity_mismatch" })
    const view = renderCompactTokenDialog()
    pasteToken()
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "accountDialog:accessTokenValidation.verifyAgain",
      }),
    )
    expect(verifyEnteredToken).toHaveBeenCalledTimes(2)
    const signal = atIndex(verifyEnteredToken.mock.calls, 1)[0].abortSignal
    view.update({ isOpen: false })
    expect(signal?.aborted).toBe(true)
  })

  it("aborts a check when the account identity changes", async () => {
    const pending = createDeferred<NewApiAccessTokenValidationResult>()
    verifyEnteredToken.mockReturnValueOnce(pending.promise)
    const view = renderCompactTokenDialog()
    pasteToken()
    const signal = atIndex(verifyEnteredToken.mock.calls, 0)[0].abortSignal
    mockState.userId = "99"
    mockState.draft.userId = "99"
    view.update()
    expect(signal?.aborted).toBe(true)
    await act(() => pending.resolve({ status: "valid" }))
    expect(
      screen.queryByText("accountDialog:accessTokenValidation.valid"),
    ).not.toBeInTheDocument()
    expect(verifyEnteredToken).toHaveBeenCalledOnce()
  })

  it("aborts verification when Save and configure starts", async () => {
    renderCompactTokenDialog()
    pasteToken()
    const signal = atIndex(verifyEnteredToken.mock.calls, 0)[0].abortSignal
    await userEvent
      .setup()
      .click(screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoConfigButton))
    expect(signal?.aborted).toBe(true)
    expect(mockHandlers.handleAutoConfig).toHaveBeenCalledOnce()
  })

  it("keeps token verification running when Save focuses a missing field", async () => {
    const view = renderCompactTokenDialog()
    pasteToken()
    const checking = await screen.findByText(
      "accountDialog:accessTokenValidation.checking",
    )
    const signal = atIndex(verifyEnteredToken.mock.calls, 0)[0].abortSignal
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "siteName", kind: "missing" }]
    view.update()
    await userEvent.click(saveAccount())
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).toHaveFocus()
    expect(checking).toBeVisible()
    expect(signal?.aborted).toBe(false)
    expect(mockHandlers.handleSaveAccount).not.toHaveBeenCalled()
  })

  it("shows a fresh detection failure for a New API draft that already has a token", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.accessToken = "saved-token"
    mockState.draft.accessToken = "saved-token"
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "The site's token exchange was blocked",
    }
    renderEditableTokenDialog({ mode: DIALOG_MODES.EDIT })
    expect(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
      ),
    ).toBeVisible()
    expect(accessTokenField()).toHaveValue("saved-token")
  })

  it.each(["isSaving", "isAutoConfiguring", "isDetecting"] as const)(
    "disables manual verification while %s",
    async (busyState) => {
      verifyEnteredToken.mockResolvedValueOnce({ status: "invalid" })
      const view = renderCompactTokenDialog()
      pasteToken()
      const button = await screen.findByRole("button", {
        name: "accountDialog:accessTokenValidation.verifyAgain",
      })
      expect(button).toBeEnabled()
      mockState[busyState] = true
      view.update()
      expect(button).toBeDisabled()
    },
  )

  it("uses in-extension verification without checking the token again", async () => {
    renderCompactTokenDialog()
    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "accountDialog:tokenCreation.title" }),
    )
    await user.click(
      screen.getByRole("button", { name: "Use created fixture token" }),
    )
    expect(accessTokenField()).toHaveValue("created-fixture-token")
    expect(accessTokenField()).toHaveClass("border-success-border")
    const feedback = screen.getByText("accountDialog:tokenCreation.complete")
    expect(feedback.closest('[role="status"]')).toHaveClass("text-xs")
    expect(verifyEnteredToken).not.toHaveBeenCalled()
  })

  it.each([
    { compact: false, narrow: false },
    { compact: false, narrow: true },
    { compact: true, narrow: true },
  ])(
    "prepares the token field for site navigation (compact: $compact, narrow: $narrow)",
    async ({ compact, narrow }) => {
      const user = userEvent.setup()
      // Route discovery is external to this focus contract. Keep it bounded so
      // the second click cannot race a still-loading first navigation.
      const resolveRoute = vi
        .spyOn(siteRoutes, "resolveAccountSiteRouteUrl")
        .mockResolvedValue("https://api.example.com/console/personal")
      onTestFinished(() => resolveRoute.mockRestore())
      const media = window.matchMedia("(max-width: 639px)")
      vi.mocked(window.matchMedia).mockImplementation((query) => ({
        ...media,
        media: query,
        matches: narrow && query === "(max-width: 639px)",
      }))
      mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
      mockState.siteType = SITE_TYPES.NEW_API
      mockState.draft.siteType = SITE_TYPES.NEW_API
      mockState.userId = mockState.draft.userId
      mockState.accessToken = ""
      mockState.draft.accessToken = ""
      if (compact) {
        mockState.isFormValid = false
        mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]
      }
      mockState.detectionError = {
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        message: "Complete security verification on the site",
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

      const input = screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
      )
      expect(input).toBeVisible()

      const acquisitionActions = screen.getByRole("group", {
        name: "accountDialog:form.accessToken",
      })
      expect(
        within(acquisitionActions).getByRole("button", {
          name: "accountDialog:tokenCreation.title",
        }),
      ).toBeVisible()
      const openSecurity = within(acquisitionActions).getByRole("button", {
        name: "accountDialog:tokenCreation.openSite",
      })

      const pending = createDeferred<string | null>()
      resolveRoute.mockReturnValueOnce(pending.promise)
      await user.click(openSecurity)
      expect(openSecurity).toHaveAttribute("aria-busy", "true")
      expect(input).toHaveFocus()
      pending.resolve(null)
      const error = await screen.findByRole("alert")
      expect(error).toHaveTextContent(
        "accountDialog:accessTokenVerification.openSecurityFailed",
      )
      expect(input.closest("form")).toContainElement(error)
      await user.click(openSecurity)

      await waitFor(() => expect(input).toHaveFocus())
      expect(input).toHaveAttribute("type", "password")
      await user.paste("manually-copied-access-token")
      expect(mockSetters.setAccessToken).toHaveBeenLastCalledWith(
        "manually-copied-access-token",
      )
      expect(
        screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
      ).toHaveValue("Example Site")

      await user.click(
        screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
      )
      const siteGuide = screen.getByRole("button", {
        name: "accountDialog:tokenCreation.manualSetup",
      })
      const docs = screen.getByRole("button", {
        name: "accountDialog:tokenCreation.manualAddDocs",
      })
      expect(docs).toBeVisible()
      expect(acquisitionActions).not.toContainElement(docs)

      // Floating UI measures the anchor and viewport to hide detached content.
      const measurements = [
        vi
          .spyOn(siteGuide, "getBoundingClientRect")
          .mockReturnValue(new DOMRect(32, 120, 128, 32)),
        vi
          .spyOn(document.documentElement, "clientWidth", "get")
          .mockReturnValue(narrow ? 340 : 1249),
        vi
          .spyOn(document.documentElement, "clientHeight", "get")
          .mockReturnValue(narrow ? 680 : 900),
      ]
      onTestFinished(() => measurements.forEach((mock) => mock.mockRestore()))

      await user.click(siteGuide)
      const guide = screen.getByRole("dialog", {
        name: "accountDialog:tokenCreation.manualSetup",
      })
      expect(within(guide).queryByRole("button")).not.toBeInTheDocument()
      expect(guide).toHaveTextContent(
        "accountDialog:tokenCreation.manualInstructions",
      )
      await user.keyboard("{Escape}")
      expect(siteGuide).toHaveFocus()
      expect(siteGuide).toHaveAttribute("aria-expanded", "false")
    },
  )

  it("exposes manual recovery guidance for a documented site type", () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.detectionError = {
      type: AutoDetectErrorType.INVALID_RESPONSE,
      message: "Detection returned unexpected data",
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
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage),
    ).toHaveTextContent("Detection returned unexpected data")
    expect(
      screen.getByText("accountDialog:manualAddRecovery.title"),
    ).toBeVisible()
    expect(
      screen.getByText("accountDialog:manualAddRecovery.description"),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:actions.openManualAddGuide",
      }),
    ).toBeVisible()
  })

  it("opens API credential profiles and closes from auto-detect fallback guidance", async () => {
    const user = userEvent.setup()
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.formSource = ACCOUNT_DIALOG_FORM_SOURCES.MANUAL
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.detectionError = {
      type: AutoDetectErrorType.INVALID_RESPONSE,
      message: "Detection returned unexpected data",
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

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:actions.openApiCredentialProfiles",
      }),
    )

    expect(mockOpenApiCredentialProfilesPage).toHaveBeenCalledTimes(1)
    expect(mockHandlers.handleClose).toHaveBeenCalledTimes(1)
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
      ...atIndex(mockSponsorRecommendationItems, 0),
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
      ...atIndex(mockSponsorRecommendationItems, 0),
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

  it.each([SITE_TYPES.SUB2API, SITE_TYPES.NEW_API])(
    "delegates post-save %s input requirements to the native editor",
    async (siteType) => {
      mockState.postSaveKeyInputAccount = {
        id: "sub2-account-id",
        name: "Sub2API",
        siteType,
      }
      mockState.postSaveKeyInputSessionId = 42
      mockHandlers.getPostSaveKeyInputDialogHandlers.mockReturnValue({
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
      expect(
        screen.getByTestId("post-save-add-token-account"),
      ).toHaveTextContent("sub2-account-id")
      expect(
        screen.getByTestId("post-save-add-token-prefill"),
      ).toBeEmptyDOMElement()
      expect(
        screen.getByTestId("post-save-add-token-notice"),
      ).toBeEmptyDOMElement()
      expect(
        screen.getByTestId("post-save-add-token-one-time"),
      ).toHaveTextContent("false")
      expect(
        mockHandlers.getPostSaveKeyInputDialogHandlers,
      ).toHaveBeenCalledWith(42)
    },
  )

  it("renders the post-save one-time key dialog only when a created secret is pending", async () => {
    mockState.postSaveOneTimeSecret = {
      correlation: {
        kind: correlationKinds.AccountCreate,
        accountId: "created-secret-fixture",
      },
      displayName: "Default API Key",
      secret: "sk-one-time",
      secretAvailability: "create-response-only",
      credential: {
        accountName: "AIHubMix",
        apiType: "openai-compatible",
        baseUrl: "https://aihubmix.com",
        siteType: SITE_TYPES.AIHUBMIX,
        tagIds: [],
      },
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
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-one-time")
    expect(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    ).toBeInTheDocument()
  })

  it("saves an AIHubMix one-time key to API credential profiles without navigating", async () => {
    const user = userEvent.setup()
    mockState.draft.siteName = "AIHubMix"
    mockState.draft.tagIds = ["tag-a"]
    mockState.postSaveOneTimeSecret = {
      correlation: {
        kind: correlationKinds.AccountKeyResource,
        ref: {
          accountId: "aihubmix-account",
          siteType: SITE_TYPES.AIHUBMIX,
          scopeKey: "account",
          resourceId: "10",
        },
      },
      displayName: "Default API Key",
      secret: "sk-one-time-full",
      secretAvailability: "create-response-only",
      credential: {
        accountName: "AIHubMix",
        apiType: "openai-compatible",
        baseUrl: "https://aihubmix.com",
        siteType: SITE_TYPES.AIHUBMIX,
        tagIds: ["tag-a"],
      },
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

    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )

    await waitFor(() => {
      expect(mockCreateApiCredentialProfile).toHaveBeenCalledWith({
        name: "AIHubMix - Default API Key",
        apiType: "openai-compatible",
        baseUrl: "https://aihubmix.com",
        apiKey: "sk-one-time-full",
        tagIds: ["tag-a"],
      })
    })
    expect(mockCaptureApiCredentialProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: {
          source: "account_key_resource",
          ref: {
            accountId: "aihubmix-account",
            siteType: SITE_TYPES.AIHUBMIX,
            scopeKey: "account",
            resourceId: "10",
          },
        },
        linkedBy: "creation-response",
      }),
    )
    expect(toast.success).toHaveBeenCalledWith(
      "keyManagement:messages.savedToApiProfiles",
    )
    expect(mockHandlers.handlePostSaveOneTimeSecretClose).not.toHaveBeenCalled()
    expect(mockOpenApiCredentialProfilesPage).not.toHaveBeenCalled()
  })

  it("keeps the AIHubMix one-time key dialog open when API profile save fails", async () => {
    const user = userEvent.setup()
    mockState.draft.siteName = "AIHubMix"
    mockState.postSaveOneTimeSecret = {
      correlation: {
        kind: correlationKinds.AccountCreate,
        accountId: "created-secret-fixture",
      },
      displayName: "Default API Key",
      secret: "sk-one-time-full",
      secretAvailability: "create-response-only",
      credential: {
        accountName: "AIHubMix",
        apiType: "openai-compatible",
        baseUrl: "https://aihubmix.com",
        siteType: SITE_TYPES.AIHUBMIX,
        tagIds: [],
      },
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

    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )

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
    expect(mockHandlers.handlePostSaveOneTimeSecretClose).not.toHaveBeenCalled()
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

  it("keeps the focused New API token UI in popup and hands off create/site actions to a persistent view", async () => {
    const user = userEvent.setup()
    const continueAction = vi.fn()
    const popup = vi
      .spyOn(browserUtils, "isExtensionPopup")
      .mockReturnValue(true)
    const createTabSpy = vi.spyOn(browserTabs, "createTab").mockResolvedValue({
      id: 99,
    } as browser.tabs.Tab)
    const handoff = vi
      .spyOn(recoveryHandoff, "useAccountDialogRecoveryHandoff")
      .mockReturnValue({
        sidePanelSupported: true,
        isPending: false,
        disabled: false,
        errorMessage: null,
        onContinue: continueAction,
      })
    onTestFinished(() => {
      popup.mockRestore()
      createTabSpy.mockRestore()
      handoff.mockRestore()
    })

    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Complete security verification on the site",
    }
    mockState.tokenRecoveryState = {
      detectionError: {
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        message: "Complete security verification on the site",
      },
      url: mockState.url,
      draft: mockState.draft,
      checkInSelectionChanged: false,
      checkInDiscoveryBaseSelection: null,
    }

    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const tokenInput = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
    )
    await waitFor(() => expect(tokenInput).toHaveFocus())
    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:tokenCreation.popupSidePanelHint"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "accountDialog:tokenCreation.title" }),
    )
    expect(continueAction).toHaveBeenCalledWith("new-api-token-create")
    expect(
      screen.queryByRole("button", { name: "Use created fixture token" }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:tokenCreation.openSite",
      }),
    )
    expect(continueAction).toHaveBeenCalledWith("new-api-token-site")
    expect(createTabSpy).not.toHaveBeenCalled()
  })

  it("hands off Edit-mode New API token replacement actions from popup after token verification fails", async () => {
    const user = userEvent.setup()
    const continueAction = vi.fn()
    const popup = vi
      .spyOn(browserUtils, "isExtensionPopup")
      .mockReturnValue(true)
    const createTabSpy = vi.spyOn(browserTabs, "createTab").mockResolvedValue({
      id: 99,
    } as browser.tabs.Tab)
    const handoff = vi
      .spyOn(recoveryHandoff, "useAccountDialogRecoveryHandoff")
      .mockImplementation(({ enabled, state }) =>
        enabled && state
          ? {
              sidePanelSupported: false,
              isPending: false,
              disabled: false,
              errorMessage: null,
              onContinue: continueAction,
            }
          : undefined,
      )
    onTestFinished(() => {
      popup.mockRestore()
      createTabSpy.mockRestore()
      handoff.mockRestore()
    })

    verifyEnteredToken.mockResolvedValueOnce({ status: "invalid" })
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = "expired-token"
    mockState.draft.accessToken = "expired-token"
    mockState.detectionError = null
    mockState.tokenRecoveryState = {
      url: mockState.url,
      draft: mockState.draft,
      accountId: "existing-account",
      checkInSelectionChanged: false,
      checkInDiscoveryBaseSelection: null,
    }

    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:accessTokenValidation.verify",
      }),
    )
    await screen.findByText("accountDialog:accessTokenValidation.invalid")
    expect(
      screen.getByText("accountDialog:tokenCreation.popupFullPageHint"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "accountDialog:tokenCreation.title" }),
    )
    expect(continueAction).toHaveBeenCalledWith("new-api-token-create")
    expect(
      screen.queryByRole("button", { name: "Use created fixture token" }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:tokenCreation.openSite",
      }),
    )
    expect(continueAction).toHaveBeenCalledWith("new-api-token-site")
    expect(createTabSpy).not.toHaveBeenCalled()
  })

  it("opens NewApiTokenCreator automatically in a persistent view after a create-token handoff", async () => {
    const user = userEvent.setup()
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Complete security verification on the site",
    }

    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        recoveryState={{
          recoveryAction: "new-api-token-create",
          detectionError: {
            type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
            message: "Complete security verification on the site",
          },
          url: mockState.url,
          draft: mockState.draft,
          checkInSelectionChanged: false,
          checkInDiscoveryBaseSelection: null,
        }}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      await screen.findByRole("button", { name: "Use created fixture token" }),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:tokenCreation.backToAccount",
      }),
    )
    expect(
      screen.queryByRole("button", { name: "Use created fixture token" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
    ).toBeVisible()
  })

  it("opens the site token page automatically in a persistent view after an open-site handoff", async () => {
    const resolveRoute = vi
      .spyOn(siteRoutes, "resolveAccountSiteRouteUrl")
      .mockResolvedValue("https://example.com/security")
    const createTabSpy = vi.spyOn(browserTabs, "createTab").mockResolvedValue({
      id: 101,
    } as browser.tabs.Tab)
    onTestFinished(() => {
      resolveRoute.mockRestore()
      createTabSpy.mockRestore()
    })

    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = "expired-token"
    mockState.draft.accessToken = "expired-token"
    mockState.detectionError = null

    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        recoveryState={{
          recoveryAction: "new-api-token-site",
          url: mockState.url,
          draft: mockState.draft,
          accountId: "existing-account",
          checkInSelectionChanged: false,
          checkInDiscoveryBaseSelection: null,
        }}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(createTabSpy).toHaveBeenCalledExactlyOnceWith(
        "https://example.com/security",
        true,
      ),
    )
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
    ).toHaveFocus()
  })

  it("reports a handoff navigation failure after the restored form is edited", async () => {
    const route = createDeferred<string | null>()
    const resolveRoute = vi
      .spyOn(siteRoutes, "resolveAccountSiteRouteUrl")
      .mockReturnValueOnce(route.promise)
    onTestFinished(() => resolveRoute.mockRestore())
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.userId = mockState.draft.userId
    mockState.accessToken = "existing-token"
    mockState.draft.accessToken = "existing-token"
    mockState.detectionError = null
    const view = renderEditableTokenDialog({
      mode: DIALOG_MODES.EDIT,
      recoveryState: {
        recoveryAction: "new-api-token-site",
        url: mockState.url,
        draft: { ...mockState.draft },
        accountId: "existing-account",
        checkInSelectionChanged: false,
        checkInDiscoveryBaseSelection: null,
      },
    })
    await waitFor(() => expect(resolveRoute).toHaveBeenCalled())
    mockState.url = "https://later-edit.example"
    view.update()
    await act(() => route.resolve(null))
    expect(
      await screen.findByText(
        "accountDialog:accessTokenVerification.openSecurityFailed",
      ),
    ).toBeVisible()
    expect(resolveRoute).toHaveBeenCalledOnce()
  })

  it("does not scroll focus away from top-of-form recovery alerts after detection", async () => {
    const popup = vi
      .spyOn(browserUtils, "isExtensionPopup")
      .mockReturnValue(true)
    const handoff = vi
      .spyOn(recoveryHandoff, "useAccountDialogRecoveryHandoff")
      .mockReturnValue({
        sidePanelSupported: true,
        isPending: false,
        disabled: false,
        errorMessage: null,
        onContinue: vi.fn(),
      })
    onTestFinished(() => {
      popup.mockRestore()
      handoff.mockRestore()
    })

    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.APIYI
    mockState.draft.siteType = SITE_TYPES.APIYI
    mockState.userId = mockState.draft.userId
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]
    mockState.detectionError = {
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: "Complete security verification on APIyi",
    }
    mockState.tokenRecoveryState = {
      detectionError: {
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        message: "Complete security verification on APIyi",
      },
      url: mockState.url,
      draft: mockState.draft,
      checkInSelectionChanged: false,
      checkInDiscoveryBaseSelection: null,
    }

    render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", {
        name: "accountDialog:accessTokenVerification.continueInSidePanel",
      }),
    ).toBeVisible()
    const tokenInput = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput,
    )
    expect(tokenInput).not.toHaveFocus()
  })

  it("does not scroll focus away from a top detection error alert when re-detect fails in Edit mode", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.NEW_API
    mockState.draft.siteType = SITE_TYPES.NEW_API
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isDetecting = true
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]

    const { rerender } = render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    mockState.isDetecting = false
    mockState.detectionError = {
      type: AutoDetectErrorType.UNAUTHORIZED,
      message: "Sign in to continue",
    }
    rerender(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage),
    ).toHaveTextContent("Sign in to continue")
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
    ).not.toHaveFocus()
  })

  it("does not scroll focus away from the OpenRouter recovery warning banner after detection", async () => {
    mockState.phase = ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM
    mockState.siteType = SITE_TYPES.OPENROUTER
    mockState.draft.siteType = SITE_TYPES.OPENROUTER
    mockState.accessToken = ""
    mockState.draft.accessToken = ""
    mockState.isDetecting = true
    mockState.isFormValid = false
    mockState.validationIssues = [{ field: "accessToken", kind: "missing" }]

    const { rerender } = render(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    mockState.isDetecting = false
    mockState.openRouterBootstrapRecovery = {
      message: "Key may have been created",
      requiresManualRecovery: true,
      label: "All API Hub",
    }
    rerender(
      <AccountDialog
        isOpen
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.getByText("Key may have been created")).toBeVisible()
    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput),
    ).not.toHaveFocus()
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
