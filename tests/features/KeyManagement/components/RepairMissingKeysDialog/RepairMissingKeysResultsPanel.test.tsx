import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { REPAIR_RESULT_VIEWS } from "~/features/KeyManagement/components/RepairMissingKeysDialog/repairMissingKeysDialogHelpers"
import { RepairMissingKeysResultsPanel } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysResultsPanel"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidToken,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
} from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.coverage.groupsCovered") {
    return `${options?.covered}/${options?.total} groups`
  }
  if (key === "keyManagement:repairMissingKeys.invalidKeys.selectedCount") {
    return `${options?.count} selected`
  }
  if (key === "keyManagement:repairMissingKeys.invalidKeys.groupUnavailable") {
    return `group unavailable: ${options?.group}`
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

function buildToken(
  overrides: Partial<AccountKeyRepairInvalidToken> = {},
): AccountKeyRepairInvalidToken {
  return {
    accountId: "account-1",
    accountName: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://account.example.invalid",
    tokenId: 1,
    tokenName: "Token 1",
    group: "missing-group",
    reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    ...overrides,
  }
}

function renderPanel(
  props: Partial<Parameters<typeof RepairMissingKeysResultsPanel>[0]> = {},
) {
  const selectedToken = buildToken()

  return render(
    <RepairMissingKeysResultsPanel
      accountIds={new Set(["account-1"])}
      activeView={REPAIR_RESULT_VIEWS.AccountCoverage}
      deleteResultMessage=""
      filteredInvalidTokens={[selectedToken]}
      filteredResults={[buildResult()]}
      invalidTokens={[
        selectedToken,
        buildToken({
          accountId: "account-2",
          tokenId: 2,
          tokenName: "Token 2",
        }),
      ]}
      openingSub2ApiAccountId={null}
      outcomeCounts={{
        created: 1,
        alreadyHad: 1,
        skipped: 0,
        failed: 0,
      }}
      outcomeFilter={null}
      searchTerm="Example"
      selectedInvalidTokenKeys={new Set()}
      selectedInvalidTokens={[]}
      visibleResults={[
        buildResult(),
        buildResult({
          accountId: "account-2",
          accountName: "Second Account",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
          finishedAt: 2,
        }),
      ]}
      onActiveViewChange={vi.fn()}
      onOpenDeleteConfirm={vi.fn()}
      onOpenSub2ApiTokenDialog={vi.fn()}
      onOutcomeFilterChange={vi.fn()}
      onSearchTermChange={vi.fn()}
      onSelectedInvalidTokenKeysChange={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

function renderPanelWithSearchState({
  onSearchTermChange = vi.fn(),
  ...props
}: Partial<Parameters<typeof RepairMissingKeysResultsPanel>[0]> = {}) {
  function StatefulPanel() {
    const [searchTerm, setSearchTerm] = useState("Example")
    const handleSearchTermChange = (value: string) => {
      setSearchTerm(value)
      onSearchTermChange(value)
    }

    return (
      <RepairMissingKeysResultsPanel
        accountIds={new Set(["account-1"])}
        activeView={REPAIR_RESULT_VIEWS.AccountCoverage}
        deleteResultMessage=""
        filteredInvalidTokens={[buildToken()]}
        filteredResults={[buildResult()]}
        invalidTokens={[buildToken()]}
        openingSub2ApiAccountId={null}
        outcomeCounts={{
          created: 1,
          alreadyHad: 0,
          skipped: 0,
          failed: 0,
        }}
        outcomeFilter={null}
        searchTerm={searchTerm}
        selectedInvalidTokenKeys={new Set()}
        selectedInvalidTokens={[]}
        visibleResults={[buildResult()]}
        onActiveViewChange={vi.fn()}
        onOpenDeleteConfirm={vi.fn()}
        onOpenSub2ApiTokenDialog={vi.fn()}
        onOutcomeFilterChange={vi.fn()}
        onSearchTermChange={handleSearchTermChange}
        onSelectedInvalidTokenKeysChange={vi.fn()}
        t={t}
        {...props}
      />
    )
  }

  return render(<StatefulPanel />)
}

describe("RepairMissingKeysResultsPanel", () => {
  it("renders account coverage counts, search controls, and outcome filters", async () => {
    const user = userEvent.setup()
    const onActiveViewChange = vi.fn()
    const onOutcomeFilterChange = vi.fn()

    renderPanel({
      onActiveViewChange,
      onOutcomeFilterChange,
    })

    expect(
      screen.getByRole("group", {
        name: "keyManagement:repairMissingKeys.views.label",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.views.accountCoverage",
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.views\.invalidKeys/,
      }),
    ).toHaveAttribute("aria-pressed", "false")
    expect(
      screen.getByTestId("repair-missing-keys-result-count"),
    ).toHaveTextContent("1/2")
    expect(screen.getByText("Example Account")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.views\.invalidKeys/,
      }),
    )
    expect(onActiveViewChange).toHaveBeenCalledWith(
      REPAIR_RESULT_VIEWS.InvalidKeys,
    )

    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.outcomes\.created/,
      }),
    )
    expect(onOutcomeFilterChange).toHaveBeenCalledWith(
      ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
    )
  })

  it("forwards controlled search updates and clear actions", async () => {
    const user = userEvent.setup()
    const onSearchTermChange = vi.fn()

    renderPanelWithSearchState({ onSearchTermChange })

    const searchInput = screen.getByRole("textbox", {
      name: "keyManagement:repairMissingKeys.searchLabel",
    })
    expect(searchInput).toHaveValue("Example")

    await user.type(searchInput, " 1")
    expect(onSearchTermChange).toHaveBeenLastCalledWith("Example 1")

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(onSearchTermChange).toHaveBeenLastCalledWith("")
    expect(searchInput).toHaveValue("")
    expect(searchInput).toHaveFocus()
  })

  it("routes invalid-key view selection and delete actions", async () => {
    const user = userEvent.setup()
    const selectedToken = buildToken()
    const onOpenDeleteConfirm = vi.fn()
    const onSelectedInvalidTokenKeysChange = vi.fn()

    renderPanel({
      activeView: REPAIR_RESULT_VIEWS.InvalidKeys,
      deleteResultMessage: "Deleted 1 invalid key",
      filteredInvalidTokens: [selectedToken],
      selectedInvalidTokenKeys: new Set(["account-1:1"]),
      selectedInvalidTokens: [selectedToken],
      onOpenDeleteConfirm,
      onSelectedInvalidTokenKeysChange,
    })

    expect(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.views\.invalidKeys/,
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByTestId("repair-missing-keys-result-count"),
    ).toHaveTextContent("1/2")
    expect(screen.getByText("Deleted 1 invalid key")).toBeInTheDocument()
    expect(screen.getByText("Token 1")).toBeInTheDocument()
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )
    expect(onOpenDeleteConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("checkbox", { name: "Token 1" }))

    const removeUpdater = onSelectedInvalidTokenKeysChange.mock.calls[0]?.[0]
    expect(removeUpdater).toBeTypeOf("function")
    expect(removeUpdater(new Set(["account-1:1"]))).toEqual(new Set())
  })
})
