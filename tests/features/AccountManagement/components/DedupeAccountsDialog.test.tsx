import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DedupeAccountsDialog from "~/features/AccountManagement/components/DedupeAccountsDialog"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const {
  deleteAccountsMock,
  pruneStatusMock,
  loadAccountDataMock,
  onCloseMock,
} = vi.hoisted(() => ({
  deleteAccountsMock: vi.fn(),
  pruneStatusMock: vi.fn(),
  loadAccountDataMock: vi.fn(),
  onCloseMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    promise: (promise: Promise<any> | (() => Promise<any>)) =>
      typeof promise === "function" ? promise() : promise,
  },
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    deleteAccounts: (...args: any[]) => deleteAccountsMock(...args),
  },
}))

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: {
    pruneStatusForDeletedAccounts: (...args: any[]) => pruneStatusMock(...args),
  },
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts: [
      {
        id: "acc-keep",
        site_name: "Example",
        site_url: "https://api.example.com/panel",
        site_type: "new-api",
        authType: AuthTypeEnum.AccessToken,
        exchange_rate: 7.2,
        health: { status: SiteHealthStatus.Healthy },
        notes: "keep notes",
        disabled: false,
        excludeFromTotalBalance: true,
        account_info: {
          id: 1,
          access_token: "token",
          username: "keep",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
        updated_at: 200,
        created_at: 200,
        tagIds: [],
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: true,
          customCheckIn: { url: "https://checkin.example.com" },
        },
      } as SiteAccount,
      {
        id: "acc-del",
        site_name: "Example",
        site_url: "https://api.example.com/v1",
        site_type: "new-api",
        authType: AuthTypeEnum.AccessToken,
        exchange_rate: 7.2,
        health: { status: SiteHealthStatus.Healthy },
        notes: "del notes",
        disabled: false,
        excludeFromTotalBalance: false,
        account_info: {
          id: 1,
          access_token: "token",
          username: "del",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
        last_sync_time: 0,
        updated_at: 100,
        created_at: 100,
        tagIds: [],
        checkIn: { enableDetection: false, autoCheckInEnabled: false },
      } as SiteAccount,
    ],
    pinnedAccountIds: [],
    orderedAccountIds: ["acc-keep", "acc-del"],
    loadAccountData: loadAccountDataMock,
  }),
}))

describe("DedupeAccountsDialog", () => {
  beforeEach(() => {
    deleteAccountsMock.mockReset()
    pruneStatusMock.mockReset()
    loadAccountDataMock.mockReset()
    onCloseMock.mockReset()

    deleteAccountsMock.mockResolvedValue({ deletedCount: 1 })
    pruneStatusMock.mockResolvedValue(true)
    loadAccountDataMock.mockResolvedValue(undefined)
  })

  it("runs scan and deletes duplicates after preview confirmation", async () => {
    const user = userEvent.setup()

    render(<DedupeAccountsDialog isOpen={true} onClose={onCloseMock} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.previewDelete",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.confirm.confirmDelete",
      }),
    )

    await waitFor(() => {
      expect(deleteAccountsMock).toHaveBeenCalledWith(["acc-del"])
      expect(pruneStatusMock).toHaveBeenCalledWith(["acc-del"])
      expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
      expect(onCloseMock).toHaveBeenCalledTimes(1)
    })
  })

  it("allows manually choosing which account to keep", async () => {
    const user = userEvent.setup()

    render(<DedupeAccountsDialog isOpen={true} onClose={onCloseMock} />)

    const groupHeader = await screen.findByText("https://api.example.com")
    const groupFieldset = groupHeader.closest("fieldset")
    expect(groupFieldset).not.toBeNull()

    const radiosBeforePick = within(groupFieldset as HTMLElement).getAllByRole(
      "radio",
    )
    expect(radiosBeforePick[0]).toHaveAccessibleName(/Example · keep/i)
    expect(radiosBeforePick[1]).toHaveAccessibleName(/Example · del/i)

    await user.click(
      await screen.findByRole("radio", {
        name: /Example · del/i,
      }),
    )

    const radiosAfterPick = within(groupFieldset as HTMLElement).getAllByRole(
      "radio",
    )
    expect(radiosAfterPick[0]).toHaveAccessibleName(/Example · keep/i)
    expect(radiosAfterPick[1]).toHaveAccessibleName(/Example · del/i)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.previewDelete",
      }),
    )

    const confirmDialog = await screen.findByRole("dialog", {
      name: "ui:dialog.dedupeAccounts.confirm.title",
    })
    const keepRow = within(confirmDialog)
      .getByText("ui:dialog.dedupeAccounts.keep:")
      .closest("div")
    const deleteRow = within(confirmDialog)
      .getByText("ui:dialog.dedupeAccounts.delete:")
      .closest("div")

    expect(keepRow).toHaveTextContent("Example · del")
    expect(deleteRow).toHaveTextContent("Example · keep")

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.confirm.confirmDelete",
      }),
    )

    await waitFor(() => {
      expect(deleteAccountsMock).toHaveBeenCalledWith(["acc-keep"])
      expect(pruneStatusMock).toHaveBeenCalledWith(["acc-keep"])
      expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
      expect(onCloseMock).toHaveBeenCalledTimes(1)
    })
  })

  it("toggles account details preview without changing keep selection", async () => {
    const user = userEvent.setup()

    render(<DedupeAccountsDialog isOpen={true} onClose={onCloseMock} />)

    const keepRadio = await screen.findByRole("radio", {
      name: /Example · keep/i,
    })
    expect(keepRadio).toBeChecked()

    const showButtons = await screen.findAllByRole("button", {
      name: "ui:dialog.dedupeAccounts.detailsToggle.show",
    })
    await user.click(showButtons[0])

    expect(keepRadio).toBeChecked()

    expect(
      await screen.findByText("ui:dialog.dedupeAccounts.details.accountId"),
    ).toBeInTheDocument()
    expect(screen.getByText("acc-keep")).toBeInTheDocument()
    expect(screen.getByText("keep notes")).toBeInTheDocument()
    expect(screen.getByText("https://checkin.example.com")).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.detailsToggle.hide",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByText("ui:dialog.dedupeAccounts.details.accountId"),
      ).not.toBeInTheDocument()
    })
  })
})
