import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render } from "~~/tests/test-utils/render"

const {
  mockHandleSetAccountDisabled,
  mockTogglePinAccount,
  fetchAccountTokensMock,
  getManagedSiteServiceMock,
  openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPageMock,
  sendRuntimeMessageMock,
  loadAccountDataMock,
  exportShareSnapshotWithToastMock,
  userPreferencesContextValue,
  accountDataContextValue,
  toastDismissMock,
  toastLoadingMock,
  toastSuccessMock,
  toastErrorMock,
  toastCustomMock,
  hasValidManagedSiteConfigMock,
  clipboardWriteTextMock,
} = vi.hoisted(() => ({
  mockHandleSetAccountDisabled: vi.fn(),
  mockTogglePinAccount: vi.fn(),
  fetchAccountTokensMock: vi.fn(),
  getManagedSiteServiceMock: vi.fn(),
  openManagedSiteChannelsForChannelMock: vi.fn(),
  openManagedSiteChannelsPageMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  loadAccountDataMock: vi.fn(),
  exportShareSnapshotWithToastMock: vi.fn(),
  userPreferencesContextValue: {
    currencyType: "USD",
    showTodayCashflow: true,
    preferences: {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    } as Partial<UserPreferences>,
  },
  accountDataContextValue: {
    isAccountPinned: vi.fn(() => false),
    togglePinAccount: vi.fn(),
    isPinFeatureEnabled: false,
    loadAccountData: vi.fn(),
  },
  toastDismissMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastCustomMock: vi.fn(),
  hasValidManagedSiteConfigMock: vi.fn(() => true),
  clipboardWriteTextMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: toastDismissMock,
    loading: toastLoadingMock,
    success: toastSuccessMock,
    error: toastErrorMock,
    custom: toastCustomMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: fetchAccountTokensMock,
    resolveApiTokenKey: async (_request: unknown, token: { key: string }) =>
      token.key,
  }),
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: getManagedSiteServiceMock,
  hasValidManagedSiteConfig: hasValidManagedSiteConfigMock,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    refreshingAccountId: null,
    handleRefreshAccount: vi.fn(),
    handleSetAccountDisabled: mockHandleSetAccountDisabled,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => accountDataContextValue,
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openEditAccount: vi.fn(),
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: any }) => children,
  useUserPreferencesContext: () => userPreferencesContextValue,
}))

vi.mock("~/utils/navigation", () => ({
  openKeysPage: vi.fn(),
  openManagedSiteChannelsForChannel: openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPage: openManagedSiteChannelsPageMock,
  openModelsPage: vi.fn(),
  openRedeemPage: vi.fn(),
  openUsagePage: vi.fn(),
}))

vi.mock("~/features/ShareSnapshots/utils/exportShareSnapshotWithToast", () => ({
  exportShareSnapshotWithToast: exportShareSnapshotWithToastMock,
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountTokenForSecret: vi.fn(
    async (_site: unknown, token: { key: string }) => token,
  ),
}))

describe("AccountActionButtons", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    })

    mockTogglePinAccount.mockResolvedValue(true)
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    accountDataContextValue.togglePinAccount = mockTogglePinAccount
    accountDataContextValue.isPinFeatureEnabled = false
    accountDataContextValue.loadAccountData = loadAccountDataMock
    clipboardWriteTextMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    userPreferencesContextValue.preferences = {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    } as Partial<UserPreferences>
    userPreferencesContextValue.showTodayCashflow = true
    hasValidManagedSiteConfigMock.mockReturnValue(true)
  })

  it("shows Enable and Delete actions when account is disabled", async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-1",
          disabled: true,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    )

    expect(
      screen.getByRole("button", { name: "account:actions.copyUrl" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "account:actions.edit" }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const enableLabel = await within(menu).findByText(
      "account:actions.enableAccount",
    )
    const deleteLabel = await within(menu).findByText("account:actions.delete")
    const enableButton = enableLabel.closest("button")
    const deleteButton = deleteLabel.closest("button")
    expect(enableButton).not.toBeNull()
    expect(deleteButton).not.toBeNull()

    expect(enableButton!).toBeInTheDocument()
    expect(enableButton!).toHaveClass("text-emerald-600")
    expect(deleteButton!).toBeInTheDocument()
    expect(deleteButton!).toHaveClass("text-red-600")
    expect(
      screen.queryByRole("button", { name: "account:actions.disableAccount" }),
    ).toBeNull()
    expect(Array.from(menu.querySelectorAll("button"))).toEqual([
      enableButton!,
      deleteButton!,
    ])

    await user.click(enableButton!)
    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
      false,
    )

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const reopenedMenu = await screen.findByRole("menu")
    const reopenedDeleteLabel = await within(reopenedMenu).findByText(
      "account:actions.delete",
    )
    const reopenedDeleteButton = reopenedDeleteLabel.closest("button")
    expect(reopenedDeleteButton).not.toBeNull()

    await user.click(reopenedDeleteButton!)
    expect(onDeleteAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
  })

  it("shows Disable action when account is enabled", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-2",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableLabel = await within(menu).findByText(
      "account:actions.disableAccount",
    )
    const deleteLabel = await within(menu).findByText("account:actions.delete")
    const disableButton = disableLabel.closest("button")
    const deleteButton = deleteLabel.closest("button")
    expect(disableButton).not.toBeNull()
    expect(deleteButton).not.toBeNull()

    expect(disableButton!).toBeInTheDocument()
    expect(disableButton!).toHaveClass("text-amber-600")
    expect(deleteButton!).toBeInTheDocument()

    const menuButtons = Array.from(menu.querySelectorAll("button"))
    const disableIndex = menuButtons.indexOf(disableButton!)
    const deleteIndex = menuButtons.indexOf(deleteButton!)
    expect(deleteIndex - disableIndex).toBe(1)
    expect(
      screen.queryByRole("button", { name: "account:actions.enableAccount" }),
    ).toBeNull()
  })

  it("closes the menu after clicking Disable to avoid showing Enable immediately", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-3",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableLabel = await within(menu).findByText(
      "account:actions.disableAccount",
    )
    const disableButton = disableLabel.closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-3" }),
      true,
    )

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  it("opens CopyKeyDialog when smart copy finds zero tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-4",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-4" }),
      )
    })

    expect(toastErrorMock).not.toHaveBeenCalledWith(
      "account:actions.noKeyFound",
    )
  })

  it("copies a single token directly when smart copy finds exactly one key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-single" }])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-single-key",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "acc-single-key",
        }),
      )
      expect(toastSuccessMock).toHaveBeenCalledWith("account:actions.keyCopied")
    })
    expect(onCopyKey).not.toHaveBeenCalled()
  })

  it("shows a fetch-info error when the token probe returns a non-array payload", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({ invalid: true } as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-non-array",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.fetchKeyInfoFailed",
      )
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("falls back to the copy dialog when the token probe throws", async () => {
    fetchAccountTokensMock.mockRejectedValueOnce(new Error("probe failed"))

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-probe-failed",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.fetchKeyListFailed",
      )
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-probe-failed" }),
      )
    })
  })

  it("sends a targeted autoCheckin:runNow payload when Quick check-in is clicked", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-5": {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey: "autoCheckin:providerFallback.checkinSuccessful",
            },
          },
        },
      })
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-5",
          disabled: false,
          name: "Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    expect(toastLoadingMock).toHaveBeenCalledWith(
      "autoCheckin:messages.loading.running",
    )
    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
        action: RuntimeActionIds.AutoCheckinRunNow,
        accountIds: ["acc-5"],
      })
      expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
        action: RuntimeActionIds.AutoCheckinGetStatus,
      })
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Site: autoCheckin:providerFallback.checkinSuccessful",
      )
      expect(loadAccountDataMock).toHaveBeenCalled()
    })
  })

  it("shows a completion fallback toast when quick check-in finishes without a per-account result", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-fallback")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, data: { perAccount: {} } })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-fallback",
          disabled: false,
          name: "Fallback Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith(
        "toast-quick-checkin-fallback",
      )
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "autoCheckin:messages.success.runCompleted",
      )
    })
  })

  it("shows a quick-checkin failure toast when the background run fails", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-error")
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      error: "background failed",
    })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-failed",
          disabled: false,
          name: "Failed Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin-error")
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
    })
  })

  it("shows a pin toggle when the feature is enabled and confirms successful pinning", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    mockTogglePinAccount.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin",
          disabled: false,
          name: "Pinned Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.pin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(mockTogglePinAccount).toHaveBeenCalledWith("acc-pin")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "messages:toast.success.accountPinned",
      )
    })
  })

  it("shares a sanitized snapshot using only visible cashflow data", async () => {
    userPreferencesContextValue.showTodayCashflow = false
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share",
          disabled: false,
          name: "Share Site",
          baseUrl: "https://api.example.com/v1/chat/completions",
          balance: { USD: 12, CNY: 0 },
          todayIncome: { USD: 8, CNY: 0 },
          todayConsumption: { USD: 4, CNY: 0 },
          last_sync_time: 0,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "shareSnapshots:actions.shareAccountSnapshot",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
    })

    const payload = exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload
    expect(payload).toEqual(
      expect.objectContaining({
        siteName: "Share Site",
        originUrl: "https://api.example.com",
        currencyType: "USD",
        balance: 12,
      }),
    )
    expect(payload).not.toHaveProperty("todayIncome")
    expect(payload).not.toHaveProperty("todayOutcome")
  })

  it("navigates to managed site channels focused by channelId when an exact match is found", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      findMatchingChannel: vi
        .fn()
        .mockResolvedValueOnce({ id: 123, key: "sk-1" }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(123)
    })
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses a secondary exact-model explanation when the account key is blank", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "",
      }),
      findMatchingChannel: vi.fn(),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/openai",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateSecondaryExactModels",
      )
    })

    expect(fetchAccountTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.com/v1/openai",
      }),
    )
    expect(managedService.findMatchingChannel).not.toHaveBeenCalled()
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("falls back to a fuzzy URL-only explanation when no secondary match exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      findMatchingChannel: vi.fn().mockResolvedValueOnce(null),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "claude-3",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateFuzzyUrlOnly",
      )
    })
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("shows a key-match-only explanation when the key matches but models do not", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      findMatchingChannel: vi.fn().mockResolvedValueOnce(null),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "claude-3",
            key: "sk-1",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7k",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateKeyMatchOnly",
      )
    })
  })

  it("shows a same-channel drift explanation when key and approximate models point to the same channel", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4", "gpt-4o"],
        key: "sk-1",
      }),
      findMatchingChannel: vi.fn().mockResolvedValueOnce(null),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 458,
            name: "Managed Channel 458",
            base_url: "https://api.example.com",
            models: "gpt-4,gpt-4o,gpt-4.1",
            key: "sk-1",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7k-drift",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateKeyMatchedModelsDrifted",
      )
    })
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("shows a conflict explanation when key and model signals point to different channels", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4", "gpt-4o"],
        key: "sk-1",
      }),
      findMatchingChannel: vi.fn().mockResolvedValueOnce(null),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 459,
            name: "Managed Channel 459",
            base_url: "https://api.example.com",
            models: "claude-3",
            key: "sk-1",
          },
          {
            id: 460,
            name: "Managed Channel 460",
            base_url: "https://api.example.com",
            models: "gpt-4,gpt-4o,gpt-4.1",
            key: "sk-2",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7k-conflict",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateSignalsConflict",
      )
    })
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("uses a secondary model-similarity explanation when the closest candidate only overlaps by similarity", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4", "gpt-4o", "gemini-2.0"],
        key: "sk-1",
      }),
      findMatchingChannel: vi.fn().mockResolvedValueOnce(null),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 457,
            name: "Managed Channel 457",
            base_url: "https://api.example.com",
            models: "gpt-4,gpt-4o,claude-3",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7c",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateSecondaryModelsSimilar",
      )
    })
  })

  it("shows a no-key fallback when the account has no API tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
      findMatchingChannel: vi.fn(),
      searchChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("shows an unresolved message when no ranked channel can be confirmed", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      findMatchingChannel: vi.fn().mockResolvedValueOnce(null),
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7d",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateUnresolved",
      )
    })
  })

  it("falls back to base URL search when multiple keys are present", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { key: "sk-1" },
      { key: "sk-2" },
    ])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
      findMatchingChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
    expect(managedService.findMatchingChannel).not.toHaveBeenCalled()
  })

  it("shows an actionable locate action for providers with reliable base-url lookup", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()
    expect(button!).toBeEnabled()
    expect(
      within(menu).queryByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      ),
    ).toBeNull()
  })

  it("shows a disabled locate action with visible Veloera guidance", async () => {
    userPreferencesContextValue.preferences = {
      managedSiteType: "Veloera",
      veloera: {
        baseUrl: "https://veloera-admin.example",
        adminToken: "veloera-admin-token",
        userId: "1",
      },
    } as Partial<UserPreferences>

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8c",
          disabled: false,
          name: "Veloera Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()
    expect(button!).toBeDisabled()
    const hint = within(menu).getByText(
      "account:actions.locateManagedSiteChannelUnsupportedHint",
    )
    expect(hint).toBeInTheDocument()
    const description = within(menu).getByText(
      "account:actions.locateManagedSiteChannelUnsupported",
    )
    expect(button!).toHaveAttribute(
      "title",
      "account:actions.locateManagedSiteChannelUnsupported",
    )
    expect(button!).toHaveAttribute("aria-describedby", description.id)

    await user.click(button!)

    expect(getManagedSiteServiceMock).not.toHaveBeenCalled()
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("hides the locate action when managed site config is missing", async () => {
    hasValidManagedSiteConfigMock.mockReturnValue(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-9",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = within(menu).queryByText(
      "account:actions.locateManagedSiteChannel",
    )
    expect(label).toBeNull()
    expect(hasValidManagedSiteConfigMock).toHaveBeenCalledWith(
      userPreferencesContextValue.preferences,
    )
    expect(getManagedSiteServiceMock).not.toHaveBeenCalled()
  })

  it("shows the account-specific config-missing fallback when admin config disappears at click-time", async () => {
    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue(null),
      prepareChannelFormData: vi.fn(),
      findMatchingChannel: vi.fn(),
      searchChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-9b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when token response is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({} as any)

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
      findMatchingChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-10",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.channelLocateFailed",
      )
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
    })
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
    expect(managedService.findMatchingChannel).not.toHaveBeenCalled()
  })
})
