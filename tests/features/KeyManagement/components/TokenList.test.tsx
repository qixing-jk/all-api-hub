import { describe, expect, it, vi } from "vitest"

import { TokenList } from "~/features/KeyManagement/components/TokenList"
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

const account = createAccount({
  id: "account-1",
  name: "Account One",
})

const createRow = (name: string) =>
  nativeRowFromSeed(account, createToken({ name, accountId: account.id }))

describe("TokenList secondary reloading state", () => {
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
