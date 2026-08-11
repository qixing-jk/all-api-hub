import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairInvalidKeysList } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairInvalidKeysList"
import { getInvalidResourceKey } from "~/features/KeyManagement/components/RepairMissingKeysDialog/repairMissingKeysDialogHelpers"
import type { AccountKeyRepairInvalidResource } from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.invalidKeys.selectedCount") {
    return `${options?.count} selected`
  }
  if (
    key ===
    "keyManagement:repairMissingKeys.invalidKeys.reasons.orphanedPlacement"
  ) {
    return "Reason: This key belongs to a group that is no longer available. Delete it if you no longer need it."
  }
  if (key === "keyManagement:repairMissingKeys.invalidKeys.reason") {
    return `reason: ${options?.reason}`
  }
  if (key === "keyManagement:repairMissingKeys.invalidKeys.group") {
    return `Group: ${options?.name}`
  }
  return key
}) as TFunction

function buildResource(
  resourceId = "resource-1",
  overrides: Partial<AccountKeyRepairInvalidResource> = {},
): AccountKeyRepairInvalidResource {
  return {
    accountId: "account-1",
    accountName: "Example Account",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://account.example.invalid",
    ref: {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId,
    },
    displayLabel: `Key ${resourceId}`,
    groupLabel: "Retired group",
    reason: "orphaned-placement",
    ...overrides,
  }
}

function renderList(
  props: Partial<Parameters<typeof RepairInvalidKeysList>[0]> = {},
) {
  const resource = buildResource()
  return render(
    <RepairInvalidKeysList
      deleteResultMessage=""
      filteredInvalidResources={[resource]}
      invalidResources={[resource]}
      selectedInvalidResourceKeys={new Set()}
      selectedInvalidResources={[]}
      onOpenDeleteConfirm={vi.fn()}
      onSelectedInvalidResourceKeysChange={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairInvalidKeysList", () => {
  it("renders delete feedback with the empty state", () => {
    renderList({
      deleteResultMessage: "Some resources still need attention",
      filteredInvalidResources: [],
      invalidResources: [],
    })

    expect(
      screen.getByText("Some resources still need attention"),
    ).toBeVisible()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.invalidKeys.emptyTitle",
      ),
    ).toBeVisible()
  })

  it("renders the key name and former group without exposing internal identity", () => {
    renderList()

    expect(screen.getByText("Key resource-1")).toBeVisible()
    expect(
      screen.getByText(
        "Reason: This key belongs to a group that is no longer available. Delete it if you no longer need it.",
      ),
    ).toBeVisible()
    expect(screen.getByText("Group: Retired group")).toBeVisible()
    expect(screen.queryByText("account")).not.toBeInTheDocument()
    expect(screen.queryByText("resource-1")).not.toBeInTheDocument()
  })

  it("selects all visible resources by full ref identity", async () => {
    const user = userEvent.setup()
    const first = buildResource("same", {
      ref: {
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "same",
      },
    })
    const second = buildResource("same", {
      ref: {
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "workspace",
        resourceId: "same",
      },
    })
    const onSelectedInvalidResourceKeysChange = vi.fn()
    renderList({
      filteredInvalidResources: [first, second],
      invalidResources: [first, second],
      onSelectedInvalidResourceKeysChange,
    })

    await user.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.invalidKeys.selectAll",
      }),
    )

    expect(onSelectedInvalidResourceKeysChange).toHaveBeenCalledWith(
      new Set([getInvalidResourceKey(first), getInvalidResourceKey(second)]),
    )
  })

  it("opens delete confirmation only when a resource is selected", async () => {
    const user = userEvent.setup()
    const selected = buildResource()
    const onOpenDeleteConfirm = vi.fn()
    const { rerender } = renderList({ onOpenDeleteConfirm })
    const deleteButton = screen.getByRole("button", {
      name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
    })
    expect(deleteButton).toBeDisabled()

    rerender(
      <RepairInvalidKeysList
        deleteResultMessage=""
        filteredInvalidResources={[selected]}
        invalidResources={[selected]}
        selectedInvalidResourceKeys={new Set([getInvalidResourceKey(selected)])}
        selectedInvalidResources={[selected]}
        onOpenDeleteConfirm={onOpenDeleteConfirm}
        onSelectedInvalidResourceKeysChange={vi.fn()}
        t={t}
      />,
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )

    expect(onOpenDeleteConfirm).toHaveBeenCalledTimes(1)
  })
})
