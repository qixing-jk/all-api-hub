import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { RepairMissingKeysProgressCard } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysProgressCard"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
} from "~/types/accountKeyAutoProvisioning"

const t = ((key: string) => key) as TFunction

function buildProgress(
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    totals: {
      enabledAccounts: 5,
      eligibleAccounts: 4,
      processedAccounts: 2,
    },
    summary: {
      complete: 1,
      partial: 1,
      blocked: 0,
      skipped: 0,
      failed: 0,
      requirements: 6,
      coveredRequirements: 2,
      createdRequirements: 1,
      blockedRequirements: 1,
      rejectedRequirements: 1,
      uncertainRequirements: 1,
      invalidResources: 2,
      renameApplied: 1,
      renameRejected: 1,
      renameUncertain: 1,
      deleteApplied: 1,
      deleteRejected: 1,
      deleteUncertain: 1,
    },
    results: [],
    ...overrides,
  }
}

function renderCard(
  props: Partial<Parameters<typeof RepairMissingKeysProgressCard>[0]> = {},
) {
  return render(
    <RepairMissingKeysProgressCard
      progress={buildProgress()}
      isCancelling={false}
      isStarting={false}
      onStartAudit={vi.fn()}
      onCancelAudit={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairMissingKeysProgressCard", () => {
  it("renders progressbar ARIA values from current processedAccounts", () => {
    renderCard()

    const progressbar = screen.getByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    expect(progressbar).toHaveAttribute("aria-valuemax", "4")
    expect(progressbar).toHaveAttribute("aria-valuenow", "2")
    expect(progressbar).toHaveAttribute("aria-valuetext", "2/4 (50%)")
  })

  it("keeps a running check focused on progress and its action", () => {
    renderCard()

    expect(
      screen.getByText("keyManagement:repairMissingKeys.progressChecked"),
    ).toBeVisible()
    expect(screen.getByText("2 / 4")).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.cancel",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("region", {
        name: "keyManagement:repairMissingKeys.summary.resultSummary",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:repairMissingKeys.summary.accountOutcomes",
      ),
    ).not.toBeInTheDocument()
  })

  it("replaces completed progress with one action-oriented attention message", () => {
    renderCard({
      progress: buildProgress({
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        summary: {
          ...buildProgress().summary,
          complete: 1,
          partial: 2,
          blocked: 1,
          skipped: 3,
          failed: 1,
          createdRequirements: 2,
          invalidResources: 4,
        },
      }),
    })

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.summary.completedNeedsAttention",
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole("progressbar", {
        name: "keyManagement:repairMissingKeys.progressLabel",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:repairMissingKeys.summary.resultSummary",
      ),
    ).not.toBeInTheDocument()
  })

  it("shows one healthy completion message without repeating result counts", () => {
    renderCard({
      progress: buildProgress({
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        summary: {
          ...buildProgress().summary,
          complete: 4,
          partial: 0,
          blocked: 0,
          skipped: 0,
          failed: 0,
          createdRequirements: 2,
          invalidResources: 0,
          rejectedRequirements: 0,
          uncertainRequirements: 0,
          renameRejected: 0,
          renameUncertain: 0,
          deleteRejected: 0,
          deleteUncertain: 0,
        },
      }),
    })

    expect(
      screen.getByText("keyManagement:repairMissingKeys.summary.healthy"),
    ).toBeVisible()
    expect(
      screen.queryByText("keyManagement:repairMissingKeys.summary.createdKeys"),
    ).not.toBeInTheDocument()
  })

  it("explains when completed accounts could not be handled automatically", () => {
    renderCard({
      progress: buildProgress({
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        summary: {
          ...buildProgress().summary,
          complete: 1,
          partial: 0,
          blocked: 0,
          skipped: 3,
          failed: 0,
          invalidResources: 0,
          rejectedRequirements: 0,
          uncertainRequirements: 0,
          renameRejected: 0,
          renameUncertain: 0,
          deleteRejected: 0,
          deleteUncertain: 0,
        },
      }),
    })

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.summary.completedWithSkipped",
      ),
    ).toBeVisible()
  })

  it("shows cancel while running and rerun after completion", async () => {
    const user = userEvent.setup()
    const onCancelAudit = vi.fn()
    const onStartAudit = vi.fn()
    const { rerender } = renderCard({ onCancelAudit, onStartAudit })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.cancel",
      }),
    )
    expect(onCancelAudit).toHaveBeenCalledTimes(1)

    rerender(
      <RepairMissingKeysProgressCard
        progress={buildProgress({
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        })}
        isCancelling={false}
        isStarting={false}
        onStartAudit={onStartAudit}
        onCancelAudit={onCancelAudit}
        t={t}
      />,
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    )
    expect(onStartAudit).toHaveBeenCalledTimes(1)
  })
})
