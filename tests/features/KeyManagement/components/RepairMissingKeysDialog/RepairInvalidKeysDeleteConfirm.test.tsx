import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairInvalidKeysDeleteConfirm } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairInvalidKeysDeleteConfirm"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { AccountKeyRepairInvalidResource } from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.deleteConfirm.title") {
    return `Delete ${options?.count} invalid keys`
  }
  if (key === "keyManagement:repairMissingKeys.deleteConfirm.more") {
    return `${options?.count} more invalid keys hidden`
  }
  return key
}) as TFunction

function buildResource(index: number): AccountKeyRepairInvalidResource {
  return {
    accountId: `account-${index}`,
    accountName: `Account ${index}`,
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: `https://account-${index}.example.invalid`,
    ref: {
      accountId: `account-${index}`,
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: `resource-${index}`,
    },
    displayLabel: `Key ${index}`,
    groupLabel: "Retired group",
    reason: "orphaned-placement",
  }
}

function renderConfirm(
  props: Partial<Parameters<typeof RepairInvalidKeysDeleteConfirm>[0]> = {},
) {
  return render(
    <RepairInvalidKeysDeleteConfirm
      isOpen={true}
      isWorking={false}
      selectedInvalidResources={[buildResource(1)]}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairInvalidKeysDeleteConfirm", () => {
  it("previews the first five selected resources and shows the hidden count", () => {
    renderConfirm({
      selectedInvalidResources: Array.from({ length: 7 }, (_, index) =>
        buildResource(index + 1),
      ),
    })

    expect(
      screen.getByRole("dialog", { name: "Delete 7 invalid keys" }),
    ).toBeVisible()
    for (let index = 1; index <= 5; index += 1) {
      expect(screen.getByText(`Key ${index}`)).toBeVisible()
      expect(
        screen.getByText(`· Account ${index} · Retired group`),
      ).toBeVisible()
    }
    expect(screen.queryByText("Key 6")).not.toBeInTheDocument()
    expect(screen.getByText("2 more invalid keys hidden")).toBeVisible()
  })

  it("passes confirm, cancel, and working state through the dialog", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const { rerender } = renderConfirm({ onClose, onConfirm })

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.deleteConfirm.confirm",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)

    rerender(
      <RepairInvalidKeysDeleteConfirm
        isOpen={true}
        isWorking={true}
        selectedInvalidResources={[buildResource(1)]}
        onClose={onClose}
        onConfirm={onConfirm}
        t={t}
      />,
    )
    expect(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    ).toBeDisabled()
    expect(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairInvalidKeysConfirmDeleteButton,
      ),
    ).toBeDisabled()
  })

  it("omits the hidden count when five resources are selected", () => {
    renderConfirm({
      selectedInvalidResources: Array.from({ length: 5 }, (_, index) =>
        buildResource(index + 1),
      ),
    })

    expect(screen.getByText("Key 5")).toBeVisible()
    expect(
      screen.queryByText(/more invalid keys hidden/),
    ).not.toBeInTheDocument()
  })
})
