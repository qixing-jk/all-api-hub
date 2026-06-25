import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairInvalidKeysDeleteConfirm } from "~/features/KeyManagement/components/RepairMissingKeysDialog/RepairInvalidKeysDeleteConfirm"
import type { AccountKeyRepairInvalidToken } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS } from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.deleteConfirm.title") {
    return `Delete ${options?.count} invalid keys`
  }
  if (key === "keyManagement:repairMissingKeys.deleteConfirm.more") {
    return `${options?.count} more invalid keys hidden`
  }

  return key
}) as TFunction

function buildToken(index: number): AccountKeyRepairInvalidToken {
  return {
    accountId: `account-${index}`,
    accountName: `Account ${index}`,
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: `https://account-${index}.example.invalid`,
    tokenId: index,
    tokenName: `Token ${index}`,
    group: "missing-group",
    reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
  }
}

function renderConfirm(
  props: Partial<Parameters<typeof RepairInvalidKeysDeleteConfirm>[0]> = {},
) {
  return render(
    <RepairInvalidKeysDeleteConfirm
      isOpen={true}
      isWorking={false}
      selectedInvalidTokens={[buildToken(1)]}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairInvalidKeysDeleteConfirm", () => {
  it("previews the first five selected tokens and shows the hidden count", () => {
    renderConfirm({
      selectedInvalidTokens: Array.from({ length: 7 }, (_, index) =>
        buildToken(index + 1),
      ),
    })

    expect(
      screen.getByRole("dialog", { name: "Delete 7 invalid keys" }),
    ).toBeInTheDocument()
    for (let index = 1; index <= 5; index += 1) {
      expect(screen.getByText(`Token ${index}`)).toBeInTheDocument()
      expect(screen.getByText(`· Account ${index}`)).toBeInTheDocument()
    }
    expect(screen.queryByText("Token 6")).toBeNull()
    expect(screen.queryByText("Token 7")).toBeNull()
    expect(screen.getByText("2 more invalid keys hidden")).toBeInTheDocument()
  })

  it("omits the hidden-count message when five or fewer tokens are selected", () => {
    renderConfirm({
      selectedInvalidTokens: Array.from({ length: 5 }, (_, index) =>
        buildToken(index + 1),
      ),
    })

    expect(screen.queryByText(/more invalid keys hidden/)).toBeNull()
  })

  it("passes confirm, cancel, and working state through the dialog surface", async () => {
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
        selectedInvalidTokens={[buildToken(1)]}
        onClose={onClose}
        onConfirm={onConfirm}
        t={t}
      />,
    )

    expect(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    ).toBeDisabled()
    expect(
      screen.getByTestId("repair-invalid-keys-confirm-delete"),
    ).toBeDisabled()
  })
})
