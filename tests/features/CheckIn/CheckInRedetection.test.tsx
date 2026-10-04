import { render as rtlRender, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import AccountSnapshotTableRow from "~/features/AutoCheckin/components/AccountSnapshotTableRow"
import ResultsTableRowActions from "~/features/AutoCheckin/components/ResultsTableRowActions"
import { CheckInRedetectionButton } from "~/features/CheckIn/CheckInRedetectionButton"
import accountDialogLocale from "~/locales/en/accountDialog.json"
import commonLocale from "~/locales/en/common.json"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { redetectSavedAccountCheckIn } from "~/services/checkin/autoCheckin/accountDiscovery"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  buildCheckInConfig,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const testI18n = await createResourceTestI18n({
  en: { accountDialog: accountDialogLocale, common: commonLocale },
})
const render = (ui: ReactElement) =>
  rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)

vi.mock("~/services/checkin/autoCheckin/accountDiscovery", () => ({
  redetectSavedAccountCheckIn: vi.fn(),
}))
vi.mock("~/services/accounts/accountStorage/accountCheckInState", () => ({
  accountCheckInState: { selectDetectedCheckInMethod: vi.fn() },
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

const PRO = AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn
const GENIUS = AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn
const account = buildSiteAccount({
  site_type: SITE_TYPES.SUB2API,
  checkIn: buildCheckInConfig({
    methodKnowledge: {
      lastFullDiscoveryAt: 100,
      methods: {
        [PRO]: {
          detection: {
            outcome: "matched",
            evidence: { source: "probe", observedAt: 100 },
          },
        },
        [GENIUS]: {
          detection: {
            outcome: "matched",
            evidence: { source: "probe", observedAt: 100 },
          },
        },
      },
    },
  }),
})
const result = {
  account,
  applied: true,
  requiresSelection: true,
  discovery: {
    config: account.checkIn,
    decision: { outcome: "ambiguous" as const, methodIds: [PRO, GENIUS] },
    detections: {},
    timedOutMethodIds: [],
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redetectSavedAccountCheckIn).mockResolvedValue(result)
  vi.mocked(accountCheckInState.selectDetectedCheckInMethod).mockResolvedValue({
    account,
    applied: true,
  })
})

describe("shared check-in redetection", () => {
  it("uses the same chooser from automatic check-in result menus", async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    render(
      <ResultsTableRowActions
        result={{
          accountId: account.id,
          accountName: "Test",
          timestamp: 1,
          status: "skipped",
          reasonCode: "no_selected_method",
        }}
        onCheckInUpdated={onUpdated}
      />,
    )
    const opener = screen.getByRole("button", {
      name: commonLocale.actions.more,
    })
    await user.click(opener)
    await user.click(
      screen.getByRole("menuitem", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    const dialog = await screen.findByRole("dialog")
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )
    expect(onUpdated).toHaveBeenCalledOnce()
    await user.click(
      screen.getByRole("button", { name: commonLocale.actions.cancel }),
    )
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it("offers the shared detection button on automatic check-in readiness rows", async () => {
    const user = userEvent.setup()
    render(
      <table>
        <tbody>
          <AccountSnapshotTableRow
            snapshot={{
              accountId: account.id,
              accountName: "Test",
              siteType: SITE_TYPES.SUB2API,
              detectionEnabled: false,
              autoCheckinEnabled: false,
              providerAvailable: false,
            }}
          />
        </tbody>
      </table>,
    )
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    expect(await screen.findByRole("dialog")).toBeVisible()
    expect(redetectSavedAccountCheckIn).toHaveBeenCalledWith(
      account.id,
      expect.any(Object),
    )
  })

  it("retires a selection dialog when its account changes", async () => {
    const user = userEvent.setup()
    const view = render(<CheckInRedetectionButton accountId={account.id} />)
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    await screen.findByRole("dialog")
    view.rerender(
      <I18nextProvider i18n={testI18n}>
        <CheckInRedetectionButton accountId="another-account" />
      </I18nextProvider>,
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens a choice dialog only when needed and saves the clicked method", async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    render(
      <CheckInRedetectionButton accountId={account.id} onUpdated={onUpdated} />,
    )
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    expect(await screen.findByRole("dialog")).toBeVisible()
    const choices = screen.getAllByRole("button", { name: /daily check-in/ })
    await user.click(choices[1]!)
    await waitFor(() =>
      expect(
        accountCheckInState.selectDetectedCheckInMethod,
      ).toHaveBeenCalledWith(account, GENIUS),
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(onUpdated).toHaveBeenCalledTimes(2)
  })

  it("cancel leaves the selection unchanged", async () => {
    const user = userEvent.setup()
    render(<CheckInRedetectionButton accountId={account.id} />)
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    await screen.findByRole("dialog")
    await user.click(
      screen.getByRole("button", { name: commonLocale.actions.cancel }),
    )
    expect(
      accountCheckInState.selectDetectedCheckInMethod,
    ).not.toHaveBeenCalled()
  })

  it("a sole method or preserved manual choice finishes without a dialog", async () => {
    vi.mocked(redetectSavedAccountCheckIn).mockResolvedValue({
      ...result,
      requiresSelection: false,
    })
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    render(
      <CheckInRedetectionButton accountId={account.id} onUpdated={onUpdated} />,
    )
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("disables repeated clicks while detecting and drops results after unmount", async () => {
    const pending = createDeferred<typeof result>()
    vi.mocked(redetectSavedAccountCheckIn).mockReturnValue(pending.promise)
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    const view = render(
      <CheckInRedetectionButton accountId={account.id} onUpdated={onUpdated} />,
    )
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    expect(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectingCheckInMethods,
      }),
    ).toBeDisabled()
    view.unmount()
    pending.resolve(result)
    await pending.promise
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it("keeps a failed choice dialog open so the user can retry", async () => {
    vi.mocked(
      accountCheckInState.selectDetectedCheckInMethod,
    ).mockRejectedValueOnce(new Error("storage failed"))
    const user = userEvent.setup()
    render(<CheckInRedetectionButton accountId={account.id} />)
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.form.redetectCheckInMethods,
      }),
    )
    await screen.findByRole("dialog")
    await user.click(
      screen.getAllByRole("button", { name: /daily check-in/ })[0]!,
    )
    expect(await screen.findByRole("alert")).toHaveTextContent("storage failed")
    expect(screen.getByRole("dialog")).toBeVisible()
  })
})
