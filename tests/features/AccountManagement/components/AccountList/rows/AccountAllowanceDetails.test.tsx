import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountAllowanceDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountAllowanceDetails"
import zhCN from "~/locales/zh-CN/account.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

describe("AccountAllowanceDetails", () => {
  afterEach(() => vi.restoreAllMocks())
  it.each([0, 80])(
    "shows Novita cash balance %s separately from available balance and borrowing limit",
    async (cash) => {
      const user = userEvent.setup()
      const i18n = await createResourceTestI18n(
        { "zh-CN": { account: zhCN } },
        "zh-CN",
      )
      render(
        <I18nextProvider i18n={i18n}>
          <AccountAllowanceDetails
            siteType="novita"
            nativeBalance={{
              unit: "USD",
              total: 93,
              permanent: cash,
              daily: 0,
              components: [
                { kind: "permanent", amount: cash },
                { kind: "permanent", name: "Credit limit", amount: 20 },
              ],
            }}
          />
        </I18nextProvider>,
      )
      await user.click(screen.getByRole("button", { name: "余额明细" }))
      const details = screen.getByRole("dialog", { name: "余额明细" })
      expect(details).toHaveTextContent("可用余额$93")
      expect(details).toHaveTextContent(`充值余额$${cash}`)
      expect(details).toHaveTextContent("信用额度（可欠款上限）$20")
      expect(details).toHaveTextContent(
        "插件暂不将 Novita 余额计入总余额、余额历史和收入估算。",
      )
      expect(details).not.toHaveTextContent("分组和套餐")
      expect(details).not.toHaveTextContent("永久额度")
      expect(details).not.toHaveTextContent("Credit limit")
    },
  )
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
