import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { TokenList } from "~/features/KeyManagement/components/TokenList"
import {
  KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES,
} from "~/features/KeyManagement/constants"
import {
  KEY_CREDENTIAL_ASSOCIATION_STATES,
  type KeyCredentialAssociationStatus,
} from "~/features/KeyManagement/credentialAssociations"
import {
  getKeyManagementAssociationTargetId,
  KEY_MANAGEMENT_TEST_IDS,
} from "~/features/KeyManagement/testIds"
import { KEY_MANAGEMENT_LOAD_STATUSES } from "~/features/KeyManagement/types"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import {
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  API_CREDENTIAL_PROFILE_LINK_STATES,
} from "~/types/apiCredentialProfiles"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))

const { openApiCredentialProfilesPageMock } = vi.hoisted(() => ({
  openApiCredentialProfilesPageMock: vi.fn(),
}))

vi.mock("~/utils/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation")>()),
  openApiCredentialProfilesPage: openApiCredentialProfilesPageMock,
}))

vi.mock("~/features/KeyManagement/components/TokenListItem", () => ({
  TokenListItem: ({
    token,
    guidedManagedSiteImportRequest,
    onSelectionChange,
    selectionDisabledReason,
    association,
    targetId,
    isNavigationTarget,
  }: {
    token: { name: string }
    guidedManagedSiteImportRequest?: string
    onSelectionChange?: (checked: boolean) => void
    selectionDisabledReason?: string
    association?: {
      status: KeyCredentialAssociationStatus
      label: string
      actionLabel?: string
      onOpen?: () => void
    }
    targetId?: string
    isNavigationTarget?: boolean
  }) => (
    <div
      id={targetId}
      tabIndex={targetId ? -1 : undefined}
      data-testid={`token-row-${token.name}`}
      data-guided-import-request={guidedManagedSiteImportRequest}
      data-navigation-target={isNavigationTarget}
    >
      {onSelectionChange || selectionDisabledReason ? (
        <input
          type="checkbox"
          aria-label={token.name}
          disabled={!onSelectionChange}
          onChange={(event) => onSelectionChange?.(event.currentTarget.checked)}
        />
      ) : null}
      {token.name}
      {association?.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Linked ? (
        <button type="button" onClick={association.onOpen}>
          {association.actionLabel}
        </button>
      ) : null}
    </div>
  ),
}))

const getVisibleTokenKey = (token: { key: string }) => token.key

const nativeRow = {
  kind: "account-key-resource" as const,
  rowKey: "native-row-1",
  accountId: "native-account",
  accountName: "Native",
  workspaceName: "Workspace",
  facts: {
    ref: {
      accountId: "native-account",
      siteType: SITE_TYPES.OPENROUTER,
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

describe("TokenList grouped all-accounts UX", () => {
  it("locates a linked account token and opens its saved credential", async () => {
    const user = userEvent.setup()
    const account = createAccount({ id: "account-example", name: "Example" })
    const token = createToken({
      id: 42,
      name: "Linked token",
      key: "sk-example",
      accountId: account.id,
      accountName: account.name,
    })
    const association = {
      id: "association-example",
      profileId: "profile-example",
      locator: {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
        accountId: account.id,
        siteType: account.siteType,
        tokenId: token.id,
      },
      state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
      linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
      createdAt: 1,
      updatedAt: 1,
    }
    const onAssociationTargetStatusChange = vi.fn()

    render(
      <TokenList
        isLoading={false}
        tokens={[token] as any}
        filteredTokens={[token] as any}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={account.id}
        displayData={[account] as any}
        credentialProfileLinks={[association]}
        associationTarget={association}
        onAssociationTargetStatusChange={onAssociationTargetStatusChange}
      />,
    )

    const target = await screen.findByTestId("token-row-Linked token")
    await waitFor(() => expect(target).toHaveFocus())
    expect(target).toHaveAttribute(
      "id",
      getKeyManagementAssociationTargetId(association.id),
    )
    expect(onAssociationTargetStatusChange).toHaveBeenCalledWith(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Found,
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:credentialAssociation.viewCredential",
      }),
    )
    expect(openApiCredentialProfilesPageMock).toHaveBeenCalledWith({
      profileId: association.profileId,
    })
  })

  it("keeps mixed native rows out of legacy batch selection and explains the eligible count", async () => {
    const user = userEvent.setup()
    const account = createAccount({ id: "legacy-account", name: "Legacy" })
    const nativeAccount = createAccount({
      id: nativeRow.accountId,
      name: nativeRow.accountName,
      siteType: SITE_TYPES.OPENROUTER,
    })
    const token = createToken({
      id: 1,
      name: "Legacy token",
      key: "sk-legacy",
      accountId: account.id,
      accountName: account.name,
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[token] as any}
        filteredTokens={[token] as any}
        nativeRows={[nativeRow]}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[account, nativeAccount] as any}
      />,
    )

    expect(
      await screen.findByText(/batchSelection\.eligibilityNotice/),
    ).toBeVisible()
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    const legacyGroup = screen.getByRole("group", { name: "Legacy" })
    const nativeGroup = screen.getByRole("group", { name: "Native" })
    expect(within(legacyGroup).getByText("Legacy token")).toBeVisible()
    expect(within(nativeGroup).getByText("Native key")).toBeVisible()

    const selection = within(legacyGroup).getByRole("checkbox", {
      name: "Legacy token",
    })
    await user.click(selection)
    expect(selection).toBeChecked()
    expect(within(nativeGroup).getAllByRole("checkbox")).toSatisfy(
      (checkboxes: HTMLElement[]) =>
        checkboxes.every((checkbox) =>
          checkbox.matches(":disabled, [aria-disabled='true']"),
        ),
    )
  })

  it("does not show a batch eligibility notice for a native-only inventory", async () => {
    const account = createAccount({
      id: nativeRow.accountId,
      name: nativeRow.accountName,
      siteType: SITE_TYPES.OPENROUTER,
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[]}
        filteredTokens={[]}
        nativeRows={[nativeRow]}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[account] as any}
      />,
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(await screen.findByText("Native key")).toBeVisible()
    expect(
      screen.queryByText(/batchSelection\.eligibilityNotice/),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole("checkbox")).toSatisfy(
      (checkboxes: HTMLElement[]) =>
        checkboxes.every((checkbox) =>
          checkbox.matches(":disabled, [aria-disabled='true']"),
        ),
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
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
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
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
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

  it("forces filtered account groups expanded", async () => {
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
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[accountA, accountB] as any}
        allAccountsFilterAccountIds={[accountA.id, accountB.id]}
      />,
    )

    expect(
      await screen.findByRole("button", { name: /account a/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText("Token A1")).toBeInTheDocument()
    expect(await screen.findByText("Token B1")).toBeInTheDocument()
  })

  it("expands the guided account group and forwards the import request", async () => {
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
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[accountA, accountB] as any}
        guidedManagedSiteImport={{
          accountId: accountB.id,
          request: "managedSite:acc-b:",
        }}
      />,
    )

    const guidedRow = await screen.findByTestId("token-row-Token B1")
    expect(guidedRow).toHaveAttribute(
      "data-guided-import-request",
      "managedSite:acc-b:",
    )
    expect(screen.queryByTestId("token-row-Token A1")).not.toBeInTheDocument()
  })

  it("includes loaded service credentials in all-account groups", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "sharedchat-account",
      name: "SharedChat",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://sharedchat.example.invalid",
    })

    render(
      <TokenList
        isLoading={false}
        tokens={[]}
        filteredTokens={[]}
        visibleKeys={new Set()}
        resolvingVisibleKeys={new Set()}
        getVisibleTokenKey={getVisibleTokenKey as any}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        handleAddToken={vi.fn()}
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        displayData={[account] as any}
        serviceCredentials={{
          [account.id]: {
            status: KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
            credential: {
              kind: "singleton_service_key",
              service: "codex",
              label: "Codex API Key",
              key: "sk-sharedchat",
              baseUrl: "https://sharedchat.example.invalid/v1",
              isAuthenticated: true,
            },
          },
        }}
        onCopyServiceCredential={vi.fn()}
        onRotateServiceCredential={vi.fn()}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(
      await screen.findByTestId(KEY_MANAGEMENT_TEST_IDS.serviceCredentialCard),
    ).toBeInTheDocument()
    expect(screen.getByText("Codex API Key")).toBeInTheDocument()
  })
})
