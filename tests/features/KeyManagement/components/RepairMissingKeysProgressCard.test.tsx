import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { RepairMissingKeysProgressCard } from "~/features/KeyManagement/components/RepairMissingKeysProgressCard"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.renameSummary.accountRenamed") {
    return `renamed ${options?.count}`
  }
  if (key === "keyManagement:repairMissingKeys.renameSummary.accountFailed") {
    return `failed ${options?.count}`
  }

  return key
}) as TFunction

function buildProgress(
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    totals: {
      enabledAccounts: 5,
      eligibleAccounts: 4,
      processedAccounts: 2,
      processedEligibleAccounts: 2,
    },
    summary: {
      created: 1,
      alreadyHad: 1,
      skipped: 1,
      failed: 0,
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
  it("renders progressbar ARIA values and progress totals", () => {
    renderCard()

    const progressbar = screen.getByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })

    expect(progressbar).toHaveAttribute("aria-valuemin", "0")
    expect(progressbar).toHaveAttribute("aria-valuemax", "4")
    expect(progressbar).toHaveAttribute("aria-valuenow", "2")
    expect(progressbar).toHaveAttribute("aria-valuetext", "2/4 (50%)")
    expect(screen.getByText("2/4 (50%)")).toBeInTheDocument()
  })

  it("hides rerun while running and shows it after terminal states", async () => {
    const user = userEvent.setup()
    const onStartAudit = vi.fn()
    const { rerender } = renderCard({ onStartAudit })

    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    ).toBeNull()

    rerender(
      <RepairMissingKeysProgressCard
        progress={buildProgress({
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        })}
        isCancelling={false}
        isStarting={false}
        onStartAudit={onStartAudit}
        onCancelAudit={vi.fn()}
        t={t}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    )

    expect(onStartAudit).toHaveBeenCalledTimes(1)

    rerender(
      <RepairMissingKeysProgressCard
        progress={buildProgress({
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Failed,
        })}
        isCancelling={false}
        isStarting={true}
        onStartAudit={onStartAudit}
        onCancelAudit={vi.fn()}
        t={t}
      />,
    )

    expect(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.actions\.rerun/,
      }),
    ).toBeDisabled()
  })

  it("shows a cancel action while running", async () => {
    const user = userEvent.setup()
    const onCancelAudit = vi.fn()

    renderCard({ onCancelAudit })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.cancel",
      }),
    )

    expect(onCancelAudit).toHaveBeenCalledTimes(1)
  })

  it("uses custom progress actions when provided", () => {
    renderCard({
      progress: buildProgress({
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      }),
      actions: (
        <button type="button">
          keyManagement:repairMissingKeys.previousResult.backToSetup
        </button>
      ),
    })

    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.backToSetup",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders state-derived processed totals and outcome counts", () => {
    renderCard({
      progress: buildProgress({
        totals: {
          enabledAccounts: 8,
          eligibleAccounts: 6,
          processedAccounts: 5,
        },
        summary: {
          created: 2,
          alreadyHad: 3,
          skipped: 4,
          failed: 1,
        },
      }),
    })

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.totalsLabels.enabledAccounts",
      ).nextElementSibling,
    ).toHaveTextContent("8")
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.totalsLabels.eligibleAccounts",
      ).nextElementSibling,
    ).toHaveTextContent("6")
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.totalsLabels.processedAccounts",
      ).nextElementSibling,
    ).toHaveTextContent("5")
    expect(
      screen.getByText("keyManagement:repairMissingKeys.outcomes.created")
        .nextElementSibling,
    ).toHaveTextContent("2")
    expect(
      screen.getByText("keyManagement:repairMissingKeys.outcomes.alreadyHad")
        .nextElementSibling,
    ).toHaveTextContent("3")
    expect(
      screen.getByText("keyManagement:repairMissingKeys.outcomes.skipped")
        .nextElementSibling,
    ).toHaveTextContent("4")
    expect(
      screen.getByText("keyManagement:repairMissingKeys.outcomes.failed")
        .nextElementSibling,
    ).toHaveTextContent("1")
  })

  it("renders auto-template rename totals when present", () => {
    renderCard({
      progress: buildProgress({
        summary: {
          created: 0,
          alreadyHad: 1,
          skipped: 0,
          failed: 0,
          renamedKeys: 3,
          renameFailed: 1,
        },
      }),
    })

    expect(
      screen.getByText("keyManagement:repairMissingKeys.renameSummary.renamed")
        .nextElementSibling,
    ).toHaveTextContent("3")
    expect(
      screen.getByText("keyManagement:repairMissingKeys.renameSummary.failed")
        .nextElementSibling,
    ).toHaveTextContent("1")
  })

  it("shows a lightweight auto-template rename result summary", () => {
    renderCard({
      progress: buildProgress({
        summary: {
          created: 0,
          alreadyHad: 1,
          skipped: 0,
          failed: 0,
          renamedKeys: 3,
          renameFailed: 1,
        },
      }),
    })

    expect(screen.getByText("renamed 3；failed 1")).toBeInTheDocument()
  })
})
