import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TokenList } from "~/features/KeyManagement/inventory/TokenList"
import { buildServiceCredentialKeyManagementEntry } from "~/features/KeyManagement/utils"
import { nativeRowFromSeed } from "~~/tests/test-utils/keyManagement/TokenListHarness"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))

const account = createAccount({
  id: "account-1",
  name: "Account One",
})

const createRow = (name: string) =>
  nativeRowFromSeed(account, createToken({ name, accountId: account.id }))

describe("TokenList secondary reloading state", () => {
  it("keeps a single-account service credential visible while inventory reloads", async () => {
    const entry = buildServiceCredentialKeyManagementEntry({
      account,
      serviceCredential: {
        status: "loaded",
        credential: {
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex API Key",
          key: "sk-test",
          isAuthenticated: true,
          baseUrl: "https://example.invalid/v1",
        },
      },
      canRotate: false,
    })!
    render(
      <TokenList
        isLoading={false}
        nativeLoading={true}
        entries={[entry]}
        filteredEntries={[entry]}
        handleAddToken={vi.fn()}
        onAddAccount={vi.fn()}
        onRequestAccountSelection={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        onCopyServiceCredential={vi.fn()}
      />,
    )
    expect(await screen.findByText("Codex API Key")).toBeVisible()
    expect(screen.getByText("common:status.refreshing")).toBeVisible()
  })

  it("renders a secondary reloading indicator and dimmed container when rows exist and nativeLoading is true", async () => {
    const row = createRow("Key 1")
    const { container } = render(
      <TokenList
        isLoading={false}
        nativeLoading={true}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        canCreateTokens={true}
        onAddAccount={vi.fn()}
        onRequestAccountSelection={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        nativeRows={[row]}
      />,
    )

    // The refreshing status banner should be displayed
    const statusBanner = await screen.findByText("common:status.refreshing")
    expect(statusBanner).toBeInTheDocument()

    // The container wrapping rows should have the reloading opacity class
    const reloadingContainer = container.querySelector(".opacity-60")
    expect(reloadingContainer).not.toBeNull()
    expect(reloadingContainer).toHaveClass("pointer-events-none")
    expect(reloadingContainer).toHaveAttribute("inert")
  })

  it("does not render the reloading banner or dimmed container when not loading", () => {
    const row = createRow("Key 1")
    const { container } = render(
      <TokenList
        isLoading={false}
        nativeLoading={false}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        canCreateTokens={true}
        onAddAccount={vi.fn()}
        onRequestAccountSelection={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        nativeRows={[row]}
      />,
    )

    expect(screen.queryByText("common:status.refreshing")).toBeNull()
    const reloadingContainer = container.querySelector(".opacity-60")
    expect(reloadingContainer).toBeNull()
    expect(container.querySelector("[inert]")).toBeNull()
  })

  it("renders loading skeleton instead when rows are empty and loading is true", () => {
    render(
      <TokenList
        isLoading={true}
        nativeLoading={false}
        entries={[]}
        filteredEntries={[]}
        handleAddToken={vi.fn()}
        canCreateTokens={true}
        onAddAccount={vi.fn()}
        onRequestAccountSelection={vi.fn()}
        selectedAccount={account.id}
        displayData={[account]}
        nativeRows={[]}
      />,
    )

    // Skeleton cards are rendered with animate-pulse
    expect(screen.queryByRole("status")).toBeNull()
  })
})

it("explains mixed batch eligibility on demand while keeping selection usable", async () => {
  const user = userEvent.setup()
  const eligible = createRow("Inference key")
  const managementAccount = createAccount({
    id: "requesty-account",
    name: "Requesty",
    siteType: "requesty",
  })
  const ineligible = nativeRowFromSeed(
    managementAccount,
    createToken({ name: "Management key", accountId: managementAccount.id }),
  )
  ineligible.rowKey = "management-key"
  ineligible.facts = {
    ...ineligible.facts,
    displayFacts: [
      {
        fieldId: "permissions",
        kind: "permission",
        role: "manage",
        granted: true,
      },
    ],
  }
  render(
    <TokenList
      isLoading={false}
      entries={[]}
      filteredEntries={[]}
      nativeRows={[eligible, ineligible]}
      displayData={[account, managementAccount]}
      selectedAccount="all"
      handleAddToken={vi.fn()}
    />,
  )
  const selectVisible = await screen.findByRole("checkbox", {
    name: "keyManagement:batchManagedSiteExport.selection.visible",
  })
  expect(
    screen.queryByText("keyManagement:batchSelection.eligibilityNotice"),
  ).not.toBeInTheDocument()
  const help = screen.getByRole("button", {
    name: "keyManagement:batchSelection.helpLabel",
  })
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  await user.hover(help)
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "keyManagement:batchSelection.eligibilityHint",
  )
  await user.unhover(help)
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  )
  await user.tab()
  await user.tab()
  expect(help).toHaveFocus()
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "keyManagement:batchSelection.eligibilityHint",
  )
  await user.click(selectVisible)
  expect(selectVisible).toBeChecked()
  expect(
    screen.getByRole("button", {
      name: "keyManagement:batchApiCredentialProfiles.actions.open",
    }),
  ).toBeEnabled()
})

it("omits batch eligibility help when all visible keys can be selected", async () => {
  render(
    <TokenList
      isLoading={false}
      entries={[]}
      filteredEntries={[]}
      nativeRows={[createRow("Inference key")]}
      displayData={[account]}
      selectedAccount={account.id}
      handleAddToken={vi.fn()}
    />,
  )
  expect(
    await screen.findByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.visible",
    }),
  ).toBeVisible()
  expect(
    screen.queryByRole("button", {
      name: "keyManagement:batchSelection.helpLabel",
    }),
  ).not.toBeInTheDocument()
})
