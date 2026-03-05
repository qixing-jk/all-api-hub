import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render } from "~~/tests/test-utils/render"

const {
  mockHandleSetAccountDisabled,
  fetchAccountTokensMock,
  getManagedSiteServiceMock,
  openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPageMock,
  sendRuntimeMessageMock,
  loadAccountDataMock,
  userPreferencesContextValue,
  toastDismissMock,
  toastLoadingMock,
  toastSuccessMock,
  toastErrorMock,
  hasValidManagedSiteConfigMock,
} = vi.hoisted(() => ({
  mockHandleSetAccountDisabled: vi.fn(),
  fetchAccountTokensMock: vi.fn(),
  getManagedSiteServiceMock: vi.fn(),
  openManagedSiteChannelsForChannelMock: vi.fn(),
  openManagedSiteChannelsPageMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  loadAccountDataMock: vi.fn(),
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
    },
  },
  toastDismissMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  hasValidManagedSiteConfigMock: vi.fn(() => true),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: toastDismissMock,
    loading: toastLoadingMock,
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: fetchAccountTokensMock,
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
  useAccountDataContext: () => ({
    isAccountPinned: () => false,
    togglePinAccount: vi.fn(),
    isPinFeatureEnabled: false,
    loadAccountData: loadAccountDataMock,
  }),
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

describe("AccountActionButtons", () => {
  afterEach(() => {
    vi.clearAllMocks()
    userPreferencesContextValue.preferences = {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    }
    hasValidManagedSiteConfigMock.mockReturnValue(true)
  })

  it("shows only Enable action when account is disabled", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-1",
          disabled: true,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
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
    const enableButton = enableLabel.closest("button")
    expect(enableButton).not.toBeNull()

    expect(enableButton!).toBeInTheDocument()
    expect(enableButton!).toHaveClass("text-emerald-600")
    expect(
      screen.queryByRole("button", { name: "account:actions.disableAccount" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "account:actions.delete" }),
    ).toBeNull()
    expect(Array.from(menu.querySelectorAll("button"))).toEqual([enableButton!])

    await user.click(enableButton!)
    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
      false,
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

  it("does not treat base-url+models matches as exact when the account key is blank", async () => {
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
      findMatchingChannel: vi.fn().mockResolvedValueOnce({ id: 456 }),
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
        "account:actions.channelLocateKeyUnavailable",
      )
    })

    expect(fetchAccountTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.com/v1/openai",
      }),
    )
    expect(managedService.findMatchingChannel).toHaveBeenCalledTimes(1)
    expect(managedService.findMatchingChannel).toHaveBeenCalledWith(
      "https://admin.example",
      "t",
      "1",
      "https://api.example.com",
      ["gpt-4"],
    )
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("falls back to base URL search and shows a toast when key-precise matching is unavailable", async () => {
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
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 456 }),
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
        "account:actions.channelLocateKeyUnavailable",
      )
    })
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
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
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateMultipleKeysFallback",
      )
    })
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
    expect(managedService.findMatchingChannel).not.toHaveBeenCalled()
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
