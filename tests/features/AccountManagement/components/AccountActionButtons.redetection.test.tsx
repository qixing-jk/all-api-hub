import "./accountActionButtonsMocks"

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import { redetectSavedAccountCheckIn } from "~/services/checkin/autoCheckin/accountDiscovery"
import {
  buildCheckInConfig,
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { render } from "~~/tests/test-utils/render"

import {
  loadAccountDataMock,
  withProtectionBypassUserCommandMock,
} from "./accountActionButtonsMocks"
import { setupAccountActionButtonsTest } from "./accountActionButtonsTestSupport"

vi.mock("~/services/checkin/autoCheckin/accountDiscovery", () => ({
  redetectSavedAccountCheckIn: vi.fn(),
}))

describe("account menu check-in redetection", () => {
  setupAccountActionButtonsTest()

  it("offers read-only detection while automatic intent is off and opens the shared chooser", async () => {
    const PRO = AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn
    const GENIUS = AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn
    const account = buildSiteAccount({
      site_type: SITE_TYPES.SUB2API,
      checkIn: buildCheckInConfig({
        methodKnowledge: {
          methods: {
            [PRO]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: 1 },
              },
            },
            [GENIUS]: {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: 1 },
              },
            },
          },
        },
      }),
    })
    vi.mocked(redetectSavedAccountCheckIn).mockResolvedValue({
      account,
      applied: true,
      requiresSelection: true,
      discovery: {
        config: account.checkIn,
        decision: { outcome: "ambiguous", methodIds: [PRO, GENIUS] },
        detections: {},
        timedOutMethodIds: [],
      },
    })
    const user = userEvent.setup()
    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: account.id,
          siteType: SITE_TYPES.SUB2API,
          checkIn: account.checkIn,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    expect(
      screen.queryByRole("menuitem", { name: "account:actions.quickCheckin" }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("menuitem", {
        name: "accountDialog:form.redetectCheckInMethods",
      }),
    )
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeVisible()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )
    expect(withProtectionBypassUserCommandMock).toHaveBeenCalledWith(
      "detect_account",
      "popup",
      expect.any(Function),
    )
    expect(redetectSavedAccountCheckIn).toHaveBeenCalledWith(
      account.id,
      expect.objectContaining({
        tempWindowRequestSource: "popup",
        signal: expect.any(AbortSignal),
      }),
    )
    expect(loadAccountDataMock).toHaveBeenCalledOnce()
    await user.click(
      within(dialog).getByRole("button", { name: "common:actions.cancel" }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "common:actions.more" }),
      ).toHaveFocus(),
    )
  })
})
