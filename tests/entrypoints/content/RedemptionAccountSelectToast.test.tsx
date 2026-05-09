import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactElement } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RedemptionAccountSelectToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionAccountSelectToast"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"

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
    siteType: SITE_TYPES.UNKNOWN,
    baseUrl: "https://example.com",
    token: "token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

const renderWithI18n = (ui: ReactElement) => {
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("RedemptionAccountSelectToast", () => {
  const scrollIntoViewMock = vi.fn()

  beforeEach(() => {
    scrollIntoViewMock.mockReset()
    Element.prototype.scrollIntoView = scrollIntoViewMock
  })

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

  it("uses the provided title/message, shows custom check-in urls, and handles confirm and cancel clicks", async () => {
    const accounts = [
      makeAccount({
        id: "acc-1",
        name: "Account 1",
        baseUrl: "https://base.example.com",
        checkIn: {
          enableDetection: false,
          customCheckIn: {
            url: "https://custom.example.com/check-in",
          },
        } as any,
      }),
      makeAccount({ id: "acc-2", name: "Account 2" }),
    ]
    const onSelect = vi.fn()

    renderWithI18n(
      <RedemptionAccountSelectToast
        title="Choose account"
        message="Select a target account."
        accounts={accounts}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText("Choose account")).toBeInTheDocument()
    expect(screen.getByText("Select a target account.")).toBeInTheDocument()
    expect(
      screen.getByText("https://custom.example.com/check-in"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    expect(onSelect).toHaveBeenNthCalledWith(1, null)

    fireEvent.click(
      screen.getByRole("button", {
        name: "redemptionAssist:accountSelect.confirm",
      }),
    )
    expect(onSelect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "acc-1" }),
    )
  })

  it("filters accounts, resets selection to the first visible result, and shows the no-results state", async () => {
    const onSelect = vi.fn()
    const accounts = [
      makeAccount({ id: "acc-1", name: "Alpha Account" }),
      makeAccount({ id: "acc-2", name: "Beta Account" }),
      makeAccount({ id: "acc-3", name: "Gamma Account" }),
    ]

    renderWithI18n(
      <RedemptionAccountSelectToast accounts={accounts} onSelect={onSelect} />,
    )

    const input = screen.getByRole("textbox")

    fireEvent.click(screen.getByRole("radio", { name: /Gamma Account/ }))
    expect(screen.getByRole("radio", { name: /Gamma Account/ })).toBeChecked()

    fireEvent.change(input, { target: { value: "beta" } })

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /Beta Account/ })).toBeChecked()
    })
    expect(
      screen.queryByRole("radio", { name: /Gamma Account/ }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "redemptionAssist:accountSelect.confirm",
      }),
    )
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-2" }),
    )

    fireEvent.change(input, { target: { value: "missing" } })

    await waitFor(() => {
      expect(
        screen.getByText("redemptionAssist:accountSelect.noResults"),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole("button", {
        name: "redemptionAssist:accountSelect.confirm",
      }),
    ).toBeDisabled()
  })

  it("ignores handled or modified keyboard shortcuts and safely no-ops when nothing is selectable", async () => {
    const onSelect = vi.fn()

    renderWithI18n(
      <RedemptionAccountSelectToast
        accounts={[makeAccount({ id: "acc-1", name: "Solo Account" })]}
        onSelect={onSelect}
      />,
    )

    const input = screen.getByRole("textbox")
    const preventedArrowDown = createEvent.keyDown(input, {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    })
    preventedArrowDown.preventDefault()
    fireEvent(input, preventedArrowDown)

    expect(screen.getByRole("radio", { name: /Solo Account/ })).toBeChecked()

    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true })
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true })

    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "missing" } })
    await waitFor(() => {
      expect(
        screen.getByText("redemptionAssist:accountSelect.noResults"),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onSelect).not.toHaveBeenCalled()
  })
})
