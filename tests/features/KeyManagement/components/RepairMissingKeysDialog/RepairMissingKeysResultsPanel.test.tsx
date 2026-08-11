import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getInvalidResourceKey,
  REPAIR_RESULT_VIEWS,
} from "~/features/KeyManagement/components/RepairMissingKeysDialog/repairMissingKeysDialogHelpers"
import { RepairMissingKeysResultsPanel } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairMissingKeysResultsPanel"
import enCommon from "~/locales/en/common.json"
import enKeyManagement from "~/locales/en/keyManagement.json"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairInvalidResource,
} from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_OUTCOMES } from "~/types/accountKeyAutoProvisioning"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const i18n = await createResourceTestI18n({
  en: { common: enCommon, keyManagement: enKeyManagement },
})
const t = i18n.t

function buildResult(
  overrides: Partial<AccountKeyRepairAccountResult> = {},
): AccountKeyRepairAccountResult {
  return {
    accountId: "account-1",
    accountName: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://account.example.invalid",
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
    requirementResults: [],
    createdRefs: [],
    invalidResources: [],
    renameResults: [],
    finishedAt: 1,
    ...overrides,
  }
}

function buildResource(): AccountKeyRepairInvalidResource {
  return {
    accountId: "account-1",
    accountName: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://account.example.invalid",
    ref: {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "resource-1",
    },
    displayLabel: "Key 1",
    reason: "orphaned-placement",
  }
}

const outcomeCounts = {
  covered: 1,
  repaired: 0,
  partial: 1,
  blocked: 1,
  skipped: 0,
  failed: 0,
}

function renderPanel(
  props: Partial<Parameters<typeof RepairMissingKeysResultsPanel>[0]> = {},
) {
  const resource = buildResource()
  return render(
    <RepairMissingKeysResultsPanel
      activeView={REPAIR_RESULT_VIEWS.AccountCoverage}
      deleteResultMessage=""
      filteredInvalidResources={[resource]}
      filteredResults={[buildResult()]}
      invalidResources={[resource]}
      outcomeCounts={outcomeCounts}
      outcomeFilter={null}
      searchTerm="Example"
      selectedInvalidResourceKeys={new Set()}
      selectedInvalidResources={[]}
      visibleResults={[
        buildResult(),
        buildResult({
          accountId: "account-2",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          finishedAt: 2,
        }),
        buildResult({
          accountId: "account-3",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked,
          finishedAt: 3,
        }),
      ]}
      onActiveViewChange={vi.fn()}
      onOpenDeleteConfirm={vi.fn()}
      onOutcomeFilterChange={vi.fn()}
      onSearchTermChange={vi.fn()}
      onSelectedInvalidResourceKeysChange={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairMissingKeysResultsPanel", () => {
  it("renders all current outcome filters and routes selection", async () => {
    const user = userEvent.setup()
    const onOutcomeFilterChange = vi.fn()
    renderPanel({ onOutcomeFilterChange })

    for (const outcome of [
      "covered",
      "repaired",
      "partial",
      "blocked",
      "skipped",
      "failed",
    ]) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(
            t(`keyManagement:repairMissingKeys.outcomes.${outcome}`),
          ),
        }),
      ).toBeVisible()
    }
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(t("keyManagement:repairMissingKeys.outcomes.partial")),
      }),
    )
    expect(onOutcomeFilterChange).toHaveBeenCalledWith(
      ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
    )
  })

  it("forwards controlled search updates and clear actions", async () => {
    const user = userEvent.setup()
    const onSearchTermChange = vi.fn()

    function StatefulPanel() {
      const [searchTerm, setSearchTerm] = useState("Example")
      return (
        <RepairMissingKeysResultsPanel
          activeView={REPAIR_RESULT_VIEWS.AccountCoverage}
          deleteResultMessage=""
          filteredInvalidResources={[]}
          filteredResults={[buildResult()]}
          invalidResources={[]}
          outcomeCounts={outcomeCounts}
          outcomeFilter={null}
          searchTerm={searchTerm}
          selectedInvalidResourceKeys={new Set()}
          selectedInvalidResources={[]}
          visibleResults={[buildResult()]}
          onActiveViewChange={vi.fn()}
          onOpenDeleteConfirm={vi.fn()}
          onOutcomeFilterChange={vi.fn()}
          onSearchTermChange={(value) => {
            setSearchTerm(value)
            onSearchTermChange(value)
          }}
          onSelectedInvalidResourceKeysChange={vi.fn()}
          t={t}
        />
      )
    }
    render(<StatefulPanel />)

    const searchInput = screen.getByRole("textbox", {
      name: t("keyManagement:repairMissingKeys.searchLabel"),
    })
    await user.type(searchInput, " 1")
    expect(onSearchTermChange).toHaveBeenLastCalledWith("Example 1")
    await user.click(
      screen.getByRole("button", { name: t("common:actions.clear") }),
    )
    expect(searchInput).toHaveValue("")
    expect(searchInput).toHaveFocus()
  })

  it("routes invalid-resource selection and delete actions", async () => {
    const user = userEvent.setup()
    const resource = buildResource()
    const key = getInvalidResourceKey(resource)
    const onOpenDeleteConfirm = vi.fn()
    const onSelectedInvalidResourceKeysChange = vi.fn()
    renderPanel({
      activeView: REPAIR_RESULT_VIEWS.InvalidKeys,
      deleteResultMessage: "One resource still needs attention",
      filteredInvalidResources: [resource],
      invalidResources: [resource],
      selectedInvalidResourceKeys: new Set([key]),
      selectedInvalidResources: [resource],
      onOpenDeleteConfirm,
      onSelectedInvalidResourceKeysChange,
    })

    expect(screen.getByText("One resource still needs attention")).toBeVisible()
    expect(screen.getByText("Key 1")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: t("keyManagement:repairMissingKeys.invalidKeys.deleteSelected"),
      }),
    )
    expect(onOpenDeleteConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("checkbox", { name: "Key 1" }))
    const removeUpdater = onSelectedInvalidResourceKeysChange.mock.calls[0]?.[0]
    expect(removeUpdater(new Set([key]))).toEqual(new Set())
  })
})
