import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairInvalidKeysList } from "~/features/KeyManagement/components/RepairInvalidKeysList"
import type { AccountKeyRepairInvalidToken } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS } from "~/types/accountKeyAutoProvisioning"

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === "keyManagement:repairMissingKeys.invalidKeys.selectedCount") {
    return `${options?.count} selected`
  }
  if (key === "keyManagement:repairMissingKeys.invalidKeys.groupUnavailable") {
    return `group unavailable: ${options?.group}`
  }

  return key
}) as TFunction

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

function renderList(
  props: Partial<Parameters<typeof RepairInvalidKeysList>[0]> = {},
) {
  const token = buildToken()

  return render(
    <RepairInvalidKeysList
      deleteResultMessage=""
      filteredInvalidTokens={[token]}
      invalidTokens={[token]}
      selectedInvalidTokenKeys={new Set()}
      selectedInvalidTokens={[]}
      onOpenDeleteConfirm={vi.fn()}
      onSelectedInvalidTokenKeysChange={vi.fn()}
      t={t}
      {...props}
    />,
  )
}

describe("RepairInvalidKeysList", () => {
  it("renders the invalid-list empty state and delete result message", () => {
    renderList({
      deleteResultMessage: "Deleted 2 stale keys",
      filteredInvalidTokens: [],
      invalidTokens: [],
    })

    expect(screen.getByText("Deleted 2 stale keys")).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.invalidKeys.emptyTitle",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.invalidKeys.emptyDescription",
      ),
    ).toBeInTheDocument()
  })

  it("renders the filtered empty state when invalid keys exist but none match", () => {
    renderList({
      filteredInvalidTokens: [],
      invalidTokens: [buildToken()],
    })

    expect(
      screen.getByText("keyManagement:repairMissingKeys.noMatchingResults"),
    ).toBeInTheDocument()
  })

  it("selects all visible invalid keys and clears selection", async () => {
    const user = userEvent.setup()
    const onSelectedInvalidTokenKeysChange = vi.fn()

    const { rerender } = renderList({
      filteredInvalidTokens: [
        buildToken({
          accountId: "account-1",
          tokenId: 1,
          tokenName: "Token 1",
        }),
        buildToken({
          accountId: "account-2",
          tokenId: 2,
          tokenName: "Token 2",
        }),
      ],
      invalidTokens: [
        buildToken({
          accountId: "account-1",
          tokenId: 1,
          tokenName: "Token 1",
        }),
        buildToken({
          accountId: "account-2",
          tokenId: 2,
          tokenName: "Token 2",
        }),
      ],
      selectedInvalidTokenKeys: new Set(),
      selectedInvalidTokens: [],
      onSelectedInvalidTokenKeysChange,
    })

    await user.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.invalidKeys.selectAll",
      }),
    )

    expect(onSelectedInvalidTokenKeysChange).toHaveBeenCalledWith(
      new Set(["account-1:1", "account-2:2"]),
    )

    const firstToken = buildToken({
      accountId: "account-1",
      tokenId: 1,
      tokenName: "Token 1",
    })
    const secondToken = buildToken({
      accountId: "account-2",
      tokenId: 2,
      tokenName: "Token 2",
    })
    rerender(
      <RepairInvalidKeysList
        deleteResultMessage=""
        filteredInvalidTokens={[firstToken, secondToken]}
        invalidTokens={[firstToken, secondToken]}
        selectedInvalidTokenKeys={new Set(["account-1:1", "account-2:2"])}
        selectedInvalidTokens={[firstToken, secondToken]}
        onOpenDeleteConfirm={vi.fn()}
        onSelectedInvalidTokenKeysChange={onSelectedInvalidTokenKeysChange}
        t={t}
      />,
    )

    await user.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.invalidKeys.selectAll",
      }),
    )

    expect(onSelectedInvalidTokenKeysChange).toHaveBeenLastCalledWith(new Set())
  })

  it("updates individual token selection", async () => {
    const user = userEvent.setup()
    const onSelectedInvalidTokenKeysChange = vi.fn()

    const { rerender } = renderList({ onSelectedInvalidTokenKeysChange })

    await user.click(screen.getByRole("checkbox", { name: "Token 1" }))

    const updater = onSelectedInvalidTokenKeysChange.mock.calls[0]?.[0]
    expect(updater).toBeTypeOf("function")
    expect(updater(new Set())).toEqual(new Set(["account-1:1"]))

    const selectedToken = buildToken()
    rerender(
      <RepairInvalidKeysList
        deleteResultMessage=""
        filteredInvalidTokens={[selectedToken]}
        invalidTokens={[selectedToken]}
        selectedInvalidTokenKeys={new Set(["account-1:1"])}
        selectedInvalidTokens={[selectedToken]}
        onOpenDeleteConfirm={vi.fn()}
        onSelectedInvalidTokenKeysChange={onSelectedInvalidTokenKeysChange}
        t={t}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Token 1" }))

    const removeUpdater = onSelectedInvalidTokenKeysChange.mock.calls[1]?.[0]
    expect(removeUpdater).toBeTypeOf("function")
    expect(removeUpdater(new Set(["account-1:1"]))).toEqual(new Set())
  })

  it("enables delete only when tokens are selected and opens confirmation", async () => {
    const user = userEvent.setup()
    const onOpenDeleteConfirm = vi.fn()
    const selectedToken = buildToken()
    const { rerender } = renderList({ onOpenDeleteConfirm })

    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    ).toBeDisabled()

    rerender(
      <RepairInvalidKeysList
        deleteResultMessage=""
        filteredInvalidTokens={[selectedToken]}
        invalidTokens={[selectedToken]}
        selectedInvalidTokenKeys={new Set(["account-1:1"])}
        selectedInvalidTokens={[selectedToken]}
        onOpenDeleteConfirm={onOpenDeleteConfirm}
        onSelectedInvalidTokenKeysChange={vi.fn()}
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
