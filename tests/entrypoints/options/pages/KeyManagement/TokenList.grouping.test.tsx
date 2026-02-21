import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { TokenList } from "~/entrypoints/options/pages/KeyManagement/components/TokenList"
import keyManagementEn from "~/locales/en/keyManagement.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

vi.mock(
  "~/entrypoints/options/pages/KeyManagement/components/TokenListItem",
  () => ({
    TokenListItem: ({ token }: { token: { name: string } }) => (
      <div>{token.name}</div>
    ),
  }),
)

const createAccount = (overrides: Partial<any>) => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "new-api",
  baseUrl: "https://example.com/v1",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const createToken = (overrides: Partial<any>) => ({
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "Token",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: false,
  used_quota: 0,
  accountId: "acc",
  accountName: "Account",
  ...overrides,
})

describe("TokenList grouped all-accounts UX", () => {
  beforeAll(() => {
    testI18n.addResourceBundle(
      "en",
      "keyManagement",
      keyManagementEn,
      true,
      true,
    )
  })

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
        selectedAccount="all"
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
        name: keyManagementEn.actions.expandAll,
      }),
    )

    expect(await screen.findByText("Token A1")).toBeInTheDocument()
    expect(await screen.findByText("Token B1")).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: keyManagementEn.actions.collapseAll,
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
        selectedAccount="all"
        displayData={[accountA, accountB] as any}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: keyManagementEn.actions.expandAll,
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
        selectedAccount="all"
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
