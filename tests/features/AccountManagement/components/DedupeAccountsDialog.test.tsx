import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DedupeAccountsDialog from "~/features/AccountManagement/components/DedupeAccountsDialog"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const accounts = [
  buildSiteAccount({
    id: "acc-keep",
    site_name: "Example",
    site_url: "https://api.example.com/panel",
    site_type: "new-api",
    exchange_rate: 7.2,
    notes: "keep notes",
    updated_at: 200,
    created_at: 200,
    excludeFromTotalBalance: true,
    checkIn: {
      enableDetection: true,
      autoCheckInEnabled: true,
      customCheckIn: { url: "https://checkin.example.com" },
    },
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
  }),
  buildSiteAccount({
    id: "acc-del",
    site_name: "Example",
    site_url: "https://api.example.com/v1",
    site_type: "new-api",
    exchange_rate: 7.2,
    notes: "del notes",
    updated_at: 100,
    created_at: 100,
    checkIn: { enableDetection: false, autoCheckInEnabled: false },
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
  }),
]

const {
  deleteAccountsMock,
  loadAccountDataMock,
  onCloseMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
} = vi.hoisted(() => ({
  deleteAccountsMock: vi.fn(),
  loadAccountDataMock: vi.fn(),
  onCloseMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
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

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts,
    pinnedAccountIds: [],
    orderedAccountIds: ["acc-keep", "acc-del"],
    loadAccountData: loadAccountDataMock,
  }),
}))

describe("DedupeAccountsDialog", () => {
  beforeEach(() => {
    deleteAccountsMock.mockReset()
    loadAccountDataMock.mockReset()
    onCloseMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()

    deleteAccountsMock.mockResolvedValue({ deletedCount: 1 })
    loadAccountDataMock.mockResolvedValue(undefined)
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
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
      expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
      expect(onCloseMock).toHaveBeenCalledTimes(1)
    })
  })

  it("completes duplicate cleanup analytics after confirmed deletion succeeds", async () => {
    const user = userEvent.setup()

    render(<DedupeAccountsDialog isOpen={true} onClose={onCloseMock} />)

    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.previewDelete",
      }),
    )

    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.dedupeAccounts.confirm.confirmDelete",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
            selectedCount: 1,
            successCount: 1,
          },
        },
      )
    })
  })

  it("completes duplicate cleanup analytics with a broad failure category", async () => {
    const user = userEvent.setup()
    deleteAccountsMock.mockRejectedValueOnce(new Error("raw backend detail"))

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
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 1,
            selectedCount: 1,
          },
        },
      )
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
