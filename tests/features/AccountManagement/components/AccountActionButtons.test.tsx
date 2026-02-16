import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"

const {
  mockHandleSetAccountDisabled,
  fetchAccountTokensMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  mockHandleSetAccountDisabled: vi.fn(),
  fetchAccountTokensMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: fetchAccountTokensMock,
  }),
}))

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
  }),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openEditAccount: vi.fn(),
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openKeysPage: vi.fn(),
  openModelsPage: vi.fn(),
  openRedeemPage: vi.fn(),
  openUsagePage: vi.fn(),
}))

describe("AccountActionButtons", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows only Enable action when account is disabled", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={
          {
            id: "acc-1",
            disabled: true,
            name: "Site",
            siteType: "test",
            baseUrl: "https://example.com",
            token: "token",
            userId: 1,
            authType: "access_token",
            checkIn: { enableDetection: false },
          } as any
        }
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "actions.copyUrl" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "actions.copyKey" }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "actions.edit" })).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const enableLabel = await within(menu).findByText("actions.enableAccount")
    const enableButton = enableLabel.closest("button")
    expect(enableButton).not.toBeNull()

    expect(enableButton!).toBeInTheDocument()
    expect(enableButton!).toHaveClass("text-emerald-600")
    expect(
      screen.queryByRole("button", { name: "actions.disableAccount" }),
    ).toBeNull()
    expect(screen.queryByRole("button", { name: "actions.delete" })).toBeNull()
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
        site={
          {
            id: "acc-2",
            disabled: false,
            name: "Site",
            siteType: "test",
            baseUrl: "https://example.com",
            token: "token",
            userId: 1,
            authType: "access_token",
            checkIn: { enableDetection: false },
          } as any
        }
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableLabel = await within(menu).findByText("actions.disableAccount")
    const deleteLabel = await within(menu).findByText("actions.delete")
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
      screen.queryByRole("button", { name: "actions.enableAccount" }),
    ).toBeNull()
  })

  it("closes the menu after clicking Disable to avoid showing Enable immediately", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={
          {
            id: "acc-3",
            disabled: false,
            name: "Site",
            siteType: "test",
            baseUrl: "https://example.com",
            token: "token",
            userId: 1,
            authType: "access_token",
            checkIn: { enableDetection: false },
          } as any
        }
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableLabel = await within(menu).findByText("actions.disableAccount")
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
        site={
          {
            id: "acc-4",
            disabled: false,
            name: "Site",
            siteType: "test",
            baseUrl: "https://example.com",
            token: "token",
            userId: 1,
            authType: "access_token",
            checkIn: { enableDetection: false },
          } as any
        }
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: "actions.copyKey" }))

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-4" }),
      )
    })

    expect(toastErrorMock).not.toHaveBeenCalledWith("actions.noKeyFound")
  })
})
