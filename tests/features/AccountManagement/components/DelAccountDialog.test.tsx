import { render as rtlRender } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import DelAccountDialog from "~/features/AccountManagement/components/DelAccountDialog"
import enUi from "~/locales/en/ui.json"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { screen } from "~~/tests/test-utils/render"

const { deleteAccountMock } = vi.hoisted(() => ({
  deleteAccountMock: vi.fn(),
}))

vi.mock(
  "~/features/AccountManagement/components/DelAccountDialog/AccountInfo",
  () => ({
    AccountInfo: () => null,
  }),
)

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: { deleteAccount: deleteAccountMock },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
}))

describe("DelAccountDialog", () => {
  beforeEach(() => {
    deleteAccountMock.mockReset()
    testI18n.addResource(
      "en",
      "ui",
      "dialog.delete.warning",
      enUi.dialog.delete.warning,
    )
  })

  afterEach(() => {
    testI18n.removeResourceBundle("en", "ui")
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
