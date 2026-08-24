import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ResultsTable from "~/features/AutoCheckin/components/ResultsTable"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { render, screen } from "~~/tests/test-utils/render"

describe("AutoCheckin ResultsTable dev actions", () => {
  const baseResult: CheckinAccountResult = {
    accountId: "account-1",
    accountName: "Account 1",
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    timestamp: 1700000000000,
    message: "ok",
  }

  it("forces action buttons when showDevActions is true", async () => {
    const onRetryAccount = vi.fn()
    const onOpenManualSignIn = vi.fn()

    render(
      <ResultsTable
        results={[baseResult]}
        showDevActions={true}
        onRetryAccount={onRetryAccount}
        onOpenManualSignIn={onOpenManualSignIn}
      />,
    )

    expect(
      await screen.findByText("autoCheckin:execution.actions.devModeHint"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "common:actions.more" }))
    expect(
      await screen.findByRole("menuitem", {
        name: "autoCheckin:execution.actions.openManual",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "account:actions.disableAccount",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", { name: "account:actions.delete" }),
    ).not.toBeInTheDocument()
  })

  it("keeps action buttons hidden when not failed and showDevActions is false", () => {
    const onRetryAccount = vi.fn()

    render(
      <ResultsTable
        results={[baseResult]}
        showDevActions={false}
        onRetryAccount={onRetryAccount}
      />,
    )

    expect(
      screen.queryByText("autoCheckin:execution.actions.devModeHint"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "autoCheckin:execution.actions.openManual",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows disable and delete actions only for failed rows", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            ...baseResult,
            accountId: "failed-account",
            accountName: "Failed Account",
            status: CHECKIN_RESULT_STATUS.FAILED,
            retryable: false,
            accountStateDurability: undefined,
          },
        ]}
        onDisableAccount={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.more" }),
    )
    expect(
      await screen.findByRole("menuitem", {
        name: "account:actions.disableAccount",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: "account:actions.delete" }),
    ).toBeInTheDocument()
  })
})
