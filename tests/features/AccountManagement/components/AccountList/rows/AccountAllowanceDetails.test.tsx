import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountAllowanceDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountAllowanceDetails"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

describe("AccountAllowanceDetails", () => {
  afterEach(() => vi.restoreAllMocks())
  it("keeps date-only expiry and reset days while timestamps use the local timezone", async () => {
    // Simulate a user west of UTC independently of the test machine's timezone.
    vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (
      this: Date,
      _locales,
      options,
    ) {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Los_Angeles",
        ...options,
      }).format(this)
    })
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (
      this: Date,
      _locales,
      options,
    ) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        ...options,
      }).format(this)
    })
    const i18n = await createResourceTestI18n({
      en: {
        account: {
          stats: {
            allowances: "Allowances",
            allowanceExpiry: "Expires: {{time}}",
            allowanceReset: "Resets: {{time}}",
          },
        },
      },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          nativeBalance={{
            unit: "USD",
            total: 3,
            permanent: 1,
            daily: 2,
            components: [
              {
                kind: "timed",
                amount: 2,
                expiresAt: "2099-07-01",
                resetAt: "2099-08-01",
              },
              {
                kind: "subscription",
                amount: 1,
                expiresAt: "2099-07-01T00:00:00Z",
              },
            ],
            timedDetails: [
              { kind: "timed", amount: 2, expiresAt: "2099-09-01" },
            ],
          }}
        />
      </I18nextProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Allowances" }))
    expect(screen.getByText("Expires: 7/1/2099")).toBeVisible()
    expect(screen.getByText("Resets: 8/1/2099")).toBeVisible()
    expect(screen.getByText("Expires: 9/1/2099")).toBeVisible()
    expect(screen.getByText("Expires: 6/30/99, 5:00 PM")).toBeVisible()
  })

  it("shows group, unlimited and timed grants with an explicit unavailable-details notice", async () => {
    const i18n = await createResourceTestI18n({
      en: {
        account: {
          stats: {
            allowances: "Allowances",
            groupAllowance: "Group allowance",
            subscriptionTitle: "Subscription",
            timedAllowance: "Timed allowance",
            timedDetailsUnavailable: "Grant details unavailable",
          },
        },
        common: { quota: { unlimited: "Unlimited" } },
      },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          nativeBalance={{
            unit: "USD",
            total: 2,
            permanent: 0,
            daily: 2,
            timedDetailsUnavailable: true,
            components: [
              { kind: "group", amount: 0, unlimited: true },
              { kind: "subscription", amount: 0 },
              { kind: "timed", name: "Timed pool", amount: 2 },
            ],
            timedDetails: [
              { kind: "timed", amount: 1, scope: "premium" },
              { kind: "timed", name: "Welcome grant", amount: 1 },
            ],
          }}
        />
      </I18nextProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Allowances" }))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Grant details unavailable",
    )
    expect(screen.getByText("Group allowance")).toBeVisible()
    expect(screen.getByText("Subscription")).toBeVisible()
    expect(screen.getByText("Unlimited")).toBeVisible()
    expect(screen.getByText("Timed allowance")).toBeVisible()
    expect(screen.getByText("Welcome grant")).toBeVisible()
    expect(screen.getByText("$1 · premium")).toBeVisible()
  })
})
