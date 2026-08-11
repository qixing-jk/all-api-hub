import { render, screen } from "@testing-library/react"
import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { RepairMissingKeysStatusBadge } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysStatusBadge"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
} from "~/types/accountKeyAutoProvisioning"

const t = ((key: string) => key) as TFunction

function buildProgress(
  summaryOverrides: Partial<AccountKeyRepairProgress["summary"]> = {},
): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
    totals: {
      enabledAccounts: 4,
      eligibleAccounts: 4,
      processedAccounts: 4,
    },
    summary: {
      complete: 4,
      partial: 0,
      blocked: 0,
      skipped: 0,
      failed: 0,
      requirements: 4,
      coveredRequirements: 4,
      createdRequirements: 0,
      blockedRequirements: 0,
      rejectedRequirements: 0,
      uncertainRequirements: 0,
      invalidResources: 0,
      renameApplied: 0,
      renameRejected: 0,
      renameUncertain: 0,
      deleteApplied: 0,
      deleteRejected: 0,
      deleteUncertain: 0,
      ...summaryOverrides,
    },
    results: [],
  }
}

describe("RepairMissingKeysStatusBadge", () => {
  it.each([
    ["partial account", { partial: 1 }],
    ["blocked account", { blocked: 1 }],
    ["failed account", { failed: 1 }],
    ["invalid key", { invalidResources: 1 }],
  ])("marks completed results with a %s as needing attention", (_, summary) => {
    render(
      <RepairMissingKeysStatusBadge progress={buildProgress(summary)} t={t} />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:repairMissingKeys.status.needsAttention",
    )
  })

  it("keeps skipped-only completion neutral instead of reporting failure", () => {
    render(
      <RepairMissingKeysStatusBadge
        progress={buildProgress({ complete: 3, skipped: 1 })}
        t={t}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:repairMissingKeys.status.completed",
    )
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "keyManagement:repairMissingKeys.status.needsAttention",
    )
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "common:status.failed",
    )
  })

  it("labels a clean completed result as completed", () => {
    render(<RepairMissingKeysStatusBadge progress={buildProgress()} t={t} />)

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:repairMissingKeys.status.completed",
    )
  })
})
