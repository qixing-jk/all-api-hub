import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { CheckInRedetectionButton } from "~/features/CheckIn/CheckInRedetectionButton"
import { addDevCheckInFixtureAccounts } from "~/features/DevPanel/fixtureAccounts"
import accountDialog from "~/locales/en/accountDialog.json"
import common from "~/locales/en/common.json"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const { data } = vi.hoisted(() => ({ data: new Map<string, unknown>() }))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = vi.fn(async (key: string) => structuredClone(data.get(key)))
    set = vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value))
    })
    remove = vi.fn(async (key: string) => {
      data.delete(key)
    })
    watch = vi.fn()
  },
}))
vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: vi.fn(async (_command, _source, task) =>
    task({ kind: "user_command" }),
  ),
}))
vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const i18n = await createResourceTestI18n({ en: { accountDialog, common } })
beforeEach(() => {
  data.clear()
  vi.stubEnv("DEV", true)
})
afterEach(() => vi.unstubAllEnvs())

it("opens the real chooser from a seeded fixture, saves a choice, and retains it on redetection", async () => {
  await addDevCheckInFixtureAccounts()
  const account = (await accountQueries.getAllAccounts()).find(
    (a) => a.site_name === "Dev Check-in: Multiple methods",
  )!
  const onUpdated = vi.fn()
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <CheckInRedetectionButton accountId={account.id} onUpdated={onUpdated} />
    </I18nextProvider>,
  )
  await user.click(
    screen.getByRole("button", {
      name: accountDialog.form.redetectCheckInMethods,
    }),
  )
  expect(await screen.findByRole("dialog")).toBeVisible()
  const choices = screen.getAllByRole("button", { name: /daily check-in/ })
  expect(choices).toHaveLength(2)
  await user.click(choices[1]!)
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  )
  expect(
    (await accountQueries.getAccountById(account.id))?.checkIn.selection,
  ).toEqual({
    mode: "manual",
    methodId: AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
  })
  await user.click(
    screen.getByRole("button", {
      name: accountDialog.form.redetectCheckInMethods,
    }),
  )
  await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(3))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
