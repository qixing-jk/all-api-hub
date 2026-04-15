import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TokenList } from "~/features/KeyManagement/components/TokenList"
import { render, screen } from "~~/tests/test-utils/render"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

describe("TokenList empty states", () => {
  it("guides the user to add an account when none exist", async () => {
    const user = userEvent.setup()
    const onAddAccount = vi.fn()

    render(
      <TokenList
        isLoading={false}
        tokens={[]}
        filteredTokens={[]}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={vi.fn()}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        onAddAccount={onAddAccount}
        selectedAccount=""
        displayData={[]}
      />,
    )

    expect(await screen.findByText("account:emptyState")).toBeInTheDocument()
    expect(
      await screen.findByText("keyManagement:pleaseAddAccount"),
    ).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "account:addFirstAccount",
      }),
    )

    expect(onAddAccount).toHaveBeenCalledTimes(1)
  })

  it("guides the user to pick an existing account before creating keys", async () => {
    const user = userEvent.setup()
    const onRequestAccountSelection = vi.fn()
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[]}
        filteredTokens={[]}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={vi.fn()}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        onRequestAccountSelection={onRequestAccountSelection}
        selectedAccount=""
        displayData={[account]}
      />,
    )

    expect(
      await screen.findByText("keyManagement:pleaseSelectAccount"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("keyManagement:selectAccountToContinue"),
    ).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:selectAccount",
      }),
    )

    expect(onRequestAccountSelection).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:createFirstKey",
      }),
    ).toBeNull()
  })

  it("keeps the create-first-key empty state after an account is selected", async () => {
    const handleAddToken = vi.fn()
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[]}
        filteredTokens={[]}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={vi.fn()}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={handleAddToken}
        selectedAccount={account.id}
        displayData={[account]}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "keyManagement:createFirstKey",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:selectAccountToContinue"),
    ).toBeNull()
  })

  it("keeps the current single-account token list visible while refreshing", async () => {
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    render(
      <TokenList
        isLoading={true}
        tokens={
          [
            {
              id: 1,
              name: "Existing Token",
              key: "sk-existing",
              accountId: account.id,
              accountName: account.name,
              status: 1,
            },
          ] as any
        }
        filteredTokens={
          [
            {
              id: 1,
              name: "Existing Token",
              key: "sk-existing",
              accountId: account.id,
              accountName: account.name,
              status: 1,
            },
          ] as any
        }
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={vi.fn((token: { key: string }) => token.key)}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
      />,
    )

    expect(await screen.findByText("Existing Token")).toBeInTheDocument()
  })
})
