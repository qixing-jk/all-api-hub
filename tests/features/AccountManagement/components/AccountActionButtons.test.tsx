import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"

const { mockHandleSetAccountDisabled } = vi.hoisted(() => ({
  mockHandleSetAccountDisabled: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

    expect(
      await screen.findByRole("button", { name: "actions.enableAccount" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "actions.disableAccount" }),
    ).toBeNull()
    expect(screen.queryByRole("button", { name: "actions.delete" })).toBeNull()

    await user.click(
      screen.getByRole("button", { name: "actions.enableAccount" }),
    )
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

    expect(
      await screen.findByRole("button", { name: "actions.disableAccount" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "actions.enableAccount" }),
    ).toBeNull()
  })
})
