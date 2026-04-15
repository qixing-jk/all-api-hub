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
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.openManual",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "account:actions.disableAccount" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "account:actions.delete" }),
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
    render(
      <ResultsTable
        results={[
          {
            ...baseResult,
            accountId: "failed-account",
            accountName: "Failed Account",
            status: CHECKIN_RESULT_STATUS.FAILED,
          },
        ]}
        onDisableAccount={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "account:actions.disableAccount",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "account:actions.delete" }),
    ).toBeInTheDocument()
  })
})
