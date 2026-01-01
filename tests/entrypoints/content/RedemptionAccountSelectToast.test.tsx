import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { RedemptionAccountSelectToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionAccountSelectToast"
import testI18nInstance from "~/tests/test-utils/i18n"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const makeAccount = (
  overrides: Partial<DisplaySiteData> & Pick<DisplaySiteData, "id" | "name">,
): DisplaySiteData => {
  return {
    username: "test-user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "test",
    baseUrl: "https://example.com",
    token: "token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

const renderWithI18n = (ui: ReactElement) => {
  return render(<I18nextProvider i18n={testI18nInstance}>{ui}</I18nextProvider>)
}

describe("RedemptionAccountSelectToast", () => {
  it("allows ArrowUp/ArrowDown to change selection even when search input is focused", async () => {
    const accounts = [
      makeAccount({ id: "acc-1", name: "Account 1" }),
      makeAccount({ id: "acc-2", name: "Account 2" }),
      makeAccount({ id: "acc-3", name: "Account 3" }),
    ]

    renderWithI18n(
      <RedemptionAccountSelectToast
        accounts={accounts}
        onSelect={vi.fn()}
        message="Pick an account"
      />,
    )

    const input = screen.getByRole("textbox")
    input.focus()

    const radio1 = screen.getByRole("radio", { name: /Account 1/ })
    const radio2 = screen.getByRole("radio", { name: /Account 2/ })
    const radio3 = screen.getByRole("radio", { name: /Account 3/ })

    expect(radio1).toBeChecked()

    fireEvent.keyDown(input, { key: "ArrowDown" })
    await waitFor(() => expect(radio2).toBeChecked())

    fireEvent.keyDown(input, { key: "ArrowUp" })
    await waitFor(() => expect(radio1).toBeChecked())

    fireEvent.keyDown(input, { key: "ArrowUp" })
    await waitFor(() => expect(radio3).toBeChecked())
  })

  it("submits selected account on Enter even when search input is focused", async () => {
    const accounts = [
      makeAccount({ id: "acc-1", name: "Account 1" }),
      makeAccount({ id: "acc-2", name: "Account 2" }),
    ]

    const onSelect = vi.fn()

    renderWithI18n(
      <RedemptionAccountSelectToast accounts={accounts} onSelect={onSelect} />,
    )

    const input = screen.getByRole("textbox")
    input.focus()

    fireEvent.keyDown(input, { key: "ArrowDown" })
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Account 2/ })).toBeChecked(),
    )

    fireEvent.keyDown(input, { key: "Enter" })

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-2" }),
    )
  })
})
