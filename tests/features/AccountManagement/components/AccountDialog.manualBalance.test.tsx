import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accountStorage"
import { server } from "~/tests/msw/server"

const { mockT } = vi.hoisted(() => ({
  mockT: (key: string) => key,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  return {
    ...actual,
    useTranslation: () => ({ t: mockT }),
  }
})

vi.mock("~/components/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithAccount: vi.fn() }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    displayData: [],
    detectedAccount: null,
    availableTags: [],
    tagCounts: {},
  }),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openEditAccount: vi.fn(),
  }),
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn().mockResolvedValue([]),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("AccountDialog manual balance", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accountStorage.clearAllData()

    vi.spyOn(globalThis.browser.tabs, "query").mockResolvedValue([
      { url: "about:blank" } as any,
    ])
  })

  it("saves manual balance when remote quota fetch fails", async () => {
    server.use(
      http.get("https://api.example.com/api/log/self", () => {
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            total: 0,
            items: [],
          },
        })
      }),
      http.get("https://api.example.com/api/user/self", () => {
        return HttpResponse.json(
          { success: false, message: "quota fetch failed" },
          { status: 500 },
        )
      }),
    )

    const { render, screen, waitFor } = await import(
      "~/tests/test-utils/render"
    )
    const { default: AccountDialog } = await import(
      "~/features/AccountManagement/components/AccountDialog"
    )

    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()

    render(
      <AccountDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.ADD}
        account={null}
        onSuccess={onSuccess}
        onError={onError}
      />,
    )

    const urlInput = await screen.findByPlaceholderText("https://example.com")
    await user.click(urlInput)
    await user.paste("https://api.example.com")

    const manualAddButton = await screen.findByRole("button", {
      name: "accountDialog:mode.manualAdd",
    })
    await user.click(manualAddButton)

    await user.type(
      await screen.findByPlaceholderText("example.com"),
      "Test Site",
    )
    await user.type(
      await screen.findByPlaceholderText("form.username"),
      "tester",
    )
    await user.type(
      await screen.findByPlaceholderText("form.userIdNumber"),
      "1",
    )
    await user.type(
      await screen.findByPlaceholderText("form.accessToken"),
      "token",
    )
    await user.type(
      await screen.findByPlaceholderText("form.exchangeRatePlaceholder"),
      "7",
    )
    await user.type(
      await screen.findByPlaceholderText("form.manualBalanceUsdPlaceholder"),
      "1.23",
    )

    const saveButton = await screen.findByRole("button", {
      name: "accountDialog:actions.saveAccount",
    })
    await user.click(saveButton)

    await waitFor(() => {
      expect(onError).not.toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
    })

    const [result] = onSuccess.mock.calls[0] ?? []
    expect(result?.accountId).toBeTruthy()

    const accountId = result.accountId as string
    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.account_info.quota).toBe(
      Math.round(1.23 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    )
  })
})
