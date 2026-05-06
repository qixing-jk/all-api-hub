import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import AccountDialog from "~/features/AccountManagement/components/AccountDialog"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  createEmptyAccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
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
  },
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
  })
}

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
    resetMockState()
  })

  it("hides the form before the dialog reaches the account-form phase", () => {
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
      screen.queryByTestId("account-management-site-name-input"),
    ).not.toBeInTheDocument()
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
})
