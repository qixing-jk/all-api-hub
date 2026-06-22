import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairAccountCoverageList } from "~/features/KeyManagement/components/RepairAccountCoverageList"
import type { AccountKeyRepairAccountResult } from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.coverage.groupsCovered") {
    return `${options?.covered}/${options?.total} groups`
  }
  if (key === "keyManagement:repairMissingKeys.coverage.createdGroup") {
    return `created ${options?.group}`
  }
  if (key === "keyManagement:repairMissingKeys.coverage.missingGroup") {
    return `missing ${options?.group}`
  }

  return key
}) as TFunction

function buildResult(
  overrides: Partial<AccountKeyRepairAccountResult> = {},
): AccountKeyRepairAccountResult {
  return {
    accountId: "account-1",
    accountName: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://account.example.invalid",
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
    finishedAt: 1,
    ...overrides,
  }
}

function renderList(
  props: Partial<Parameters<typeof RepairAccountCoverageList>[0]> = {},
) {
  return render(
    <RepairAccountCoverageList
      accountIds={new Set(["account-1"])}
      filteredResults={[buildResult()]}
      openingSub2ApiAccountId={null}
      onOpenSub2ApiTokenDialog={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairAccountCoverageList", () => {
  it("renders the empty state when no account results match", () => {
    renderList({ filteredResults: [] })

    expect(
      screen.getByText("keyManagement:repairMissingKeys.noMatchingResults"),
    ).toBeInTheDocument()
  })

  it("renders account details, outcome details, and coverage groups", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
          errorMessage: "Could not create missing key",
          availableGroups: ["default", "vip", "trial"],
          coveredGroups: ["default"],
          createdGroups: ["default"],
          missingGroups: ["vip"],
        }),
      ],
    })

    expect(screen.getByText("Example Account")).toBeInTheDocument()
    expect(screen.getByText(SITE_TYPES.NEW_API)).toBeInTheDocument()
    expect(
      screen.getByText("https://account.example.invalid"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:repairMissingKeys.outcomes.failed"),
    ).toBeInTheDocument()
    expect(screen.getByText("Could not create missing key")).toBeInTheDocument()
    expect(screen.getByText("1/3 groups")).toBeInTheDocument()
    expect(screen.getByText("created default")).toBeInTheDocument()
    expect(screen.getByText("missing vip")).toBeInTheDocument()
  })

  it("shows the Sub2API create-token action only for current skipped accounts", async () => {
    const user = userEvent.setup()
    const onOpenSub2ApiTokenDialog = vi.fn()

    renderList({
      accountIds: new Set(["account-1"]),
      filteredResults: [
        buildResult({
          accountId: "account-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
        }),
        buildResult({
          accountId: "account-2",
          accountName: "Removed Account",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
          finishedAt: 2,
        }),
        buildResult({
          accountId: "account-3",
          accountName: "None Auth Account",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
          finishedAt: 3,
        }),
      ],
      onOpenSub2ApiTokenDialog,
    })

    const createButtons = screen.getAllByRole("button", {
      name: "keyManagement:dialog.createToken",
    })
    expect(createButtons).toHaveLength(1)

    await user.click(createButtons[0])

    expect(onOpenSub2ApiTokenDialog).toHaveBeenCalledWith("account-1")
    expect(onOpenSub2ApiTokenDialog).toHaveBeenCalledTimes(1)
  })

  it("disables the Sub2API create-token action while that account is opening", () => {
    renderList({
      filteredResults: [
        buildResult({
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
        }),
      ],
      openingSub2ApiAccountId: "account-1",
    })

    expect(
      screen.getByText("keyManagement:dialog.createToken").closest("button"),
    ).toBeDisabled()
  })
})
