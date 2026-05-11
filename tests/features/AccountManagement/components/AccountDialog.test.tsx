import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import AccountDialog from "~/features/AccountManagement/components/AccountDialog"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { ACCOUNT_POST_SAVE_WORKFLOW_STEPS } from "~/services/accounts/accountPostSaveWorkflow"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockState,
  mockSetters,
  mockHandlers,
  mockCreateTag,
  mockRenameTag,
  mockDeleteTag,
  mockOpenEditAccount,
} = vi.hoisted(() => ({
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
    handlePostSaveOneTimeTokenClose: vi.fn(),
    handlePostSaveSub2ApiTokenDialogClose: vi.fn(),
    handlePostSaveSub2ApiTokenCreated: vi.fn(),
    getPostSaveSub2ApiDialogHandlers: vi.fn(),
  },
  mockCreateTag: vi.fn(),
  mockRenameTag: vi.fn(),
  mockDeleteTag: vi.fn(),
  mockOpenEditAccount: vi.fn(),
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
  }) => (
    <div data-testid="post-save-one-time-key-dialog">
      <div data-testid="post-save-one-time-key-open">
        {String(props.isOpen)}
      </div>
      <div data-testid="post-save-one-time-key-value">
        {props.token?.key ?? ""}
      </div>
    </div>
  ),
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
      "messages:sub2api.createRequiresGroupSelection",
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
  })
})
