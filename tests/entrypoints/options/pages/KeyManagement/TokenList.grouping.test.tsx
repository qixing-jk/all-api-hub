import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TokenList } from "~/entrypoints/options/pages/KeyManagement/components/TokenList"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/entrypoints/options/pages/KeyManagement/constants"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~/tests/utils/keyManagementFactories"

vi.mock(
  "~/entrypoints/options/pages/KeyManagement/components/TokenListItem",
  () => ({
    TokenListItem: ({ token }: { token: { name: string } }) => (
      <div>{token.name}</div>
    ),
  }),
)

describe("TokenList grouped all-accounts UX", () => {
  it("groups tokens by account and supports collapse/expand all", async () => {
    const user = userEvent.setup()

    const accountA = createAccount({ id: "acc-a", name: "Account A" })
    const accountB = createAccount({ id: "acc-b", name: "Account B" })

    const tokenA1 = createToken({
      id: 1,
      name: "Token A1",
      key: "sk-a1",
      accountId: accountA.id,
      accountName: accountA.name,
    })
    const tokenA2 = createToken({
      id: 2,
      name: "Token A2",
      key: "sk-a2",
      accountId: accountA.id,
      accountName: accountA.name,
    })
    const tokenB1 = createToken({
      id: 1,
      name: "Token B1",
      key: "sk-b1",
      accountId: accountB.id,
      accountName: accountB.name,
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[tokenA1, tokenA2, tokenB1] as any}
        filteredTokens={[tokenA1, tokenA2, tokenB1] as any}
        visibleKeys={new Set()}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[accountA, accountB] as any}
      />,
    )

    expect(
      await screen.findByRole("button", { name: /account a/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: /account b/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText("Token A1")).not.toBeInTheDocument()
    expect(screen.queryByText("Token B1")).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(await screen.findByText("Token A1")).toBeInTheDocument()
    expect(await screen.findByText("Token B1")).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.collapseAll",
      }),
    )

    await waitFor(() =>
      expect(screen.queryByText("Token A1")).not.toBeInTheDocument(),
    )
    expect(screen.queryByText("Token B1")).not.toBeInTheDocument()
  })

  it("collapses individual groups independently", async () => {
    const user = userEvent.setup()

    const accountA = createAccount({ id: "acc-a", name: "Account A" })
    const accountB = createAccount({ id: "acc-b", name: "Account B" })

    const tokenA1 = createToken({
      id: 1,
      name: "Token A1",
      key: "sk-a1",
      accountId: accountA.id,
      accountName: accountA.name,
    })
    const tokenB1 = createToken({
      id: 1,
      name: "Token B1",
      key: "sk-b1",
      accountId: accountB.id,
      accountName: accountB.name,
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[tokenA1, tokenB1] as any}
        filteredTokens={[tokenA1, tokenB1] as any}
        visibleKeys={new Set()}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[accountA, accountB] as any}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(await screen.findByText("Token A1")).toBeInTheDocument()
    expect(await screen.findByText("Token B1")).toBeInTheDocument()

    await user.click(await screen.findByRole("button", { name: /Account A/i }))

    await waitFor(() =>
      expect(screen.queryByText("Token A1")).not.toBeInTheDocument(),
    )
    expect(await screen.findByText("Token B1")).toBeInTheDocument()
  })

  it("forces the filtered account group expanded", async () => {
    const accountA = createAccount({ id: "acc-a", name: "Account A" })
    const accountB = createAccount({ id: "acc-b", name: "Account B" })

    const tokenA1 = createToken({
      id: 1,
      name: "Token A1",
      key: "sk-a1",
      accountId: accountA.id,
      accountName: accountA.name,
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[tokenA1] as any}
        filteredTokens={[tokenA1] as any}
        visibleKeys={new Set()}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[accountA, accountB] as any}
        allAccountsFilterAccountId={accountA.id}
      />,
    )

    expect(
      await screen.findByRole("button", { name: /account a/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText("Token A1")).toBeInTheDocument()
  })
})
