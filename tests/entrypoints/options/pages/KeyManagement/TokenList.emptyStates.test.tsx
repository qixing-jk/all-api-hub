import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenEmptyState } from "~/features/KeyManagement/components/TokenEmptyState"
import { TokenList } from "~/features/KeyManagement/components/TokenList"
import { createTab } from "~/utils/browser/browserApi"
import { nativeRowFromSeed } from "~~/tests/test-utils/keyManagement/TokenListHarness"
import { render, screen } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  createTab: vi.fn().mockResolvedValue(undefined),
}))

const { openSiteSupportRequestPageMock } = vi.hoisted(() => ({
  openSiteSupportRequestPageMock: vi.fn(),
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openSiteSupportRequestPage: openSiteSupportRequestPageMock,
  }
})

describe("TokenList empty states", () => {
  beforeEach(() => {
    openSiteSupportRequestPageMock.mockReset()
    openSiteSupportRequestPageMock.mockResolvedValue(undefined)
  })

  it("opens the selected site from a load failure", async () => {
    const user = userEvent.setup()
    const account = createAccount({ baseUrl: " https://site.example.invalid " })
    render(
      <TokenEmptyState
        selectedAccount={account.id}
        totalCount={0}
        displayData={[account]}
        handleAddToken={vi.fn()}
        currentAccountLoadError="offline"
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:loadError.openSite",
      }),
    )
    expect(createTab).toHaveBeenCalledWith("https://site.example.invalid", true)
    expect(
      screen.getByRole("button", { name: "keyManagement:refreshTokenList" }),
    ).toBeDisabled()
  })

  it.each([true, false])(
    "omits unavailable setup actions when there are no accounts: %s",
    async (noAccounts) => {
      const account = createAccount({})
      render(
        <TokenEmptyState
          selectedAccount=""
          totalCount={0}
          displayData={noAccounts ? [] : [account]}
          handleAddToken={vi.fn()}
        />,
      )
      expect(
        await screen.findByText(
          noAccounts
            ? "account:emptyState"
            : "keyManagement:pleaseSelectAccount",
        ),
      ).toBeVisible()
      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    },
  )

  it("keeps the unsupported-site recovery action usable after a failed navigation", async () => {
    const user = userEvent.setup()
    const account = createAccount({})
    openSiteSupportRequestPageMock.mockRejectedValueOnce(
      new Error("navigation unavailable"),
    )
    render(
      <TokenEmptyState
        selectedAccount={account.id}
        totalCount={0}
        displayData={[account]}
        handleAddToken={vi.fn()}
        currentAccountUnsupportedKeyManagement
      />,
    )
    const action = await screen.findByRole("button", {
      name: "keyManagement:unsupportedSource.requestSiteSupport",
    })
    await user.click(action)
    await user.click(action)
    expect(openSiteSupportRequestPageMock).toHaveBeenCalledTimes(2)
    expect(action).toBeEnabled()
  })

  it("guides the user to add an account when none exist", async () => {
    const user = userEvent.setup()
    const onAddAccount = vi.fn()

    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
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
        entries={[]}
        filteredEntries={[]}
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
        entries={[]}
        filteredEntries={[]}
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

  it("disables the create-first-key action when token creation is unsupported", async () => {
    const user = userEvent.setup()
    const handleAddToken = vi.fn()
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={handleAddToken}
        canCreateTokens={false}
        selectedAccount={account.id}
        displayData={[account]}
      />,
    )

    const createButton = await screen.findByRole("button", {
      name: "keyManagement:createFirstKey",
    })

    expect(createButton).toBeDisabled()

    await user.click(createButton)

    expect(handleAddToken).not.toHaveBeenCalled()
  })

  it("shows a site-support request entry when key management is unsupported", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "unsupported-account",
      baseUrl: "https://unsupported.example.invalid",
      siteType: "future-site",
    })

    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        currentAccountUnsupportedKeyManagement={true}
      />,
    )

    expect(
      await screen.findByText("keyManagement:unsupportedSource.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:unsupportedSource.description"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:unsupportedSource.requestSiteSupport",
      }),
    )

    expect(openSiteSupportRequestPageMock).toHaveBeenCalledWith({
      siteUrl: "https://unsupported.example.invalid",
      errorType: "key_management_unsupported",
      errorMessage:
        "keyManagement:unsupportedSource.supportRequestErrorMessage",
    })
  })

  it("keeps the current single-account token list visible while refreshing", async () => {
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    render(
      <TokenList
        isLoading={true}
        entries={[]}
        filteredEntries={[]}
        nativeRows={[
          nativeRowFromSeed(
            account,
            createToken({ name: "Existing Token", accountId: account.id }),
          ),
        ]}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
      />,
    )

    expect(await screen.findByText("Existing Token")).toBeInTheDocument()
  })

  it("uses the combined native count instead of showing a legacy empty state", async () => {
    const account = createAccount({
      id: "account-example",
      name: "Example account",
    })
    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        nativeRows={[
          {
            kind: "account-key-resource",
            rowKey: "native-row-1",
            accountId: account.id,
            accountName: account.name,
            scopeName: "Example workspace",
            facts: {
              ref: {
                accountId: account.id,
                siteType: "openrouter",
                scopeKey: "workspace-example",
                resourceId: "hash-example",
              },
              displayName: "Native key",
              maskedLabel: "sk-or-v1-••••example",
              status: "enabled",
              fields: [],
              actions: { canUpdate: true, canDelete: true },
            },
          },
        ]}
      />,
    )

    expect(await screen.findByText("Native key")).toBeInTheDocument()
    expect(screen.queryByText("keyManagement:noKeys")).toBeNull()
  })

  it("shows loading for an unresolved native-only inventory instead of a no-keys empty state", () => {
    const account = createAccount({ id: "account-example", name: "Example" })
    render(
      <TokenList
        isLoading={false}
        nativeLoading
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
      />,
    )

    expect(screen.queryByText("keyManagement:noKeys")).toBeNull()
    expect(screen.queryByText("keyManagement:noMatchingKeys")).toBeNull()
  })

  it("shows an actionable load failure for an unknown native inventory instead of asserting no keys", async () => {
    const user = userEvent.setup()
    const account = createAccount({ id: "account-example", name: "Example" })
    const retry = vi.fn()
    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        nativeInventoryLoadError="keyManagement:messages.loadFailed"
        onRetryCurrentAccount={retry}
      />,
    )

    expect(
      await screen.findByText("keyManagement:loadError.title"),
    ).toBeVisible()
    expect(screen.queryByText("keyManagement:noKeys")).toBeNull()
    expect(screen.queryByText("keyManagement:createFirstKey")).toBeNull()
    await user.click(
      screen.getByRole("button", { name: "keyManagement:refreshTokenList" }),
    )
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("shows no matching keys when a native search/filter hides an otherwise loaded key", async () => {
    const account = createAccount({ id: "account-example", name: "Example" })
    const nativeRow = {
      kind: "account-key-resource" as const,
      rowKey: "native-row-1",
      accountId: account.id,
      accountName: account.name,
      scopeName: "Workspace",
      facts: {
        ref: {
          accountId: account.id,
          siteType: "openrouter" as const,
          scopeKey: "workspace-example",
          resourceId: "hash-example",
        },
        displayName: "Native key",
        maskedLabel: "sk-or-v1-••••example",
        status: "enabled" as const,
        fields: [],
        actions: { canUpdate: true, canDelete: true },
      },
    }
    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
        nativeRows={[]}
        nativeUnfilteredRows={[nativeRow]}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
      />,
    )

    expect(
      await screen.findByText("keyManagement:noMatchingKeys"),
    ).toBeVisible()
    expect(screen.queryByText("keyManagement:noKeys")).toBeNull()
  })
})
