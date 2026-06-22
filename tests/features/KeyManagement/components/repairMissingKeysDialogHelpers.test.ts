import { describe, expect, it } from "vitest"

import {
  getRepairProgressBarColor,
  getRepairProgressTotals,
} from "~/features/KeyManagement/components/repairMissingKeysDialogHelpers"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

function buildProgress(
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    totals: {
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 0,
    },
    summary: {
      created: 0,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
    },
    results: [],
    ...overrides,
  }
}

describe("repairMissingKeysDialogHelpers", () => {
  it("uses a zero progress percentage when no account is eligible", () => {
    expect(
      getRepairProgressTotals(
        buildProgress({
          totals: {
            enabledAccounts: 1,
            eligibleAccounts: 0,
            processedAccounts: 0,
          },
        }),
      ),
    ).toEqual({
      eligibleTotal: 0,
      processedTotal: 0,
      progressMax: 1,
      progressPercent: 0,
    })
  })

  it("uses the warning progress color for completed runs with failures", () => {
    expect(
      getRepairProgressBarColor(
        buildProgress({
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
          summary: {
            created: 1,
            alreadyHad: 0,
            skipped: 0,
            failed: 1,
          },
        }),
      ),
    ).toBe("bg-amber-600 dark:bg-amber-500")
  })
})
