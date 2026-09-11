import { render as rtlRender } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import DelAccountDialog from "~/features/AccountManagement/components/DelAccountDialog"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import enUi from "~/locales/en/ui.json"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { screen, waitFor } from "~~/tests/test-utils/render"

const { deleteAccountMock } = vi.hoisted(() => ({
  deleteAccountMock: vi.fn(),
}))

vi.mock(
  "~/features/AccountManagement/components/DelAccountDialog/AccountInfo",
  () => ({
    AccountInfo: () => null,
  }),
)

vi.mock("~/services/accounts/accountStorage/accountMutations", () => ({
  accountMutations: { deleteAccount: deleteAccountMock },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
}))

describe("DelAccountDialog", () => {
  it("keeps confirmation open after a failed deletion and allows retry", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onDeleted = vi.fn()
    const account = buildDisplaySiteData({ id: "suspected-old" })
    deleteAccountMock
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValueOnce(true)
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <DelAccountDialog
          isOpen
          account={account}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      </I18nextProvider>,
    )
    const confirm = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.deleteConfirmButton,
    )
    await user.click(confirm)
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(deleteAccountMock).toHaveBeenCalledWith("suspected-old")
    expect(onClose).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    await user.click(confirm)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(deleteAccountMock).toHaveBeenCalledTimes(2)
  })

  beforeAll(() => {
    testI18n.addResource(
      "en",
      "ui",
      "dialog.delete.warning",
      enUi.dialog.delete.warning,
    )
  })

  afterAll(() => {
    testI18n.removeResourceBundle("en", "ui")
  })

  beforeEach(() => {
    deleteAccountMock.mockReset()
  })

  it("uses the generic local account deletion confirmation for OpenRouter", () => {
    const account = buildDisplaySiteData({
      siteType: "openrouter",
      name: "OpenRouter",
    })

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <DelAccountDialog
          isOpen
          onClose={vi.fn()}
          account={account}
          onDeleted={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText(
        enUi.dialog.delete.warning.replace("{{accountName}}", account.name),
      ),
    ).toBeInTheDocument()
  })

  it("uses the generic deletion confirmation for compatible accounts", () => {
    const account = buildDisplaySiteData({
      siteType: "new-api",
      name: "Compatible",
    })

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <DelAccountDialog
          isOpen
          onClose={vi.fn()}
          account={account}
          onDeleted={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText(
        enUi.dialog.delete.warning.replace("{{accountName}}", account.name),
      ),
    ).toBeInTheDocument()
  })
})
