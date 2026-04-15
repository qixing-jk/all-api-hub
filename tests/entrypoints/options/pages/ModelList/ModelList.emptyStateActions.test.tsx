import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelList from "~/entrypoints/options/pages/ModelList"
import { pushWithinOptionsPage } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockUseModelListData = vi.fn()

vi.mock("~/features/ModelList/hooks/useModelListData", () => ({
  useModelListData: (...args: unknown[]) => mockUseModelListData(...args),
}))

vi.mock("~/services/models/utils/modelProviders", () => ({
  getAllProviders: () => [],
}))

vi.mock("~/services/verification/verificationResultHistory", () => ({
  createAccountModelVerificationHistoryTarget: vi.fn(() => "account-target"),
  createProfileModelVerificationHistoryTarget: vi.fn(() => "profile-target"),
  useVerificationResultHistorySummaries: vi.fn(() => ({
    summariesByKey: {},
  })),
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: vi.fn(),
  }
})

vi.mock("~/features/ModelList/components/AccountSelector", () => {
  function MockAccountSelector(props: { selectorOpen?: boolean }) {
    const { selectorOpen } = props

    return (
      <button
        type="button"
        role="combobox"
        aria-expanded={selectorOpen === true}
      >
        Mock source selector
      </button>
    )
  }

  return {
    AccountSelector: MockAccountSelector,
  }
})

vi.mock("~/features/ModelList/components/StatusIndicator", () => ({
  StatusIndicator: () => <div>Status Indicator</div>,
}))

vi.mock("~/features/ModelList/components/AccountSummaryBar", () => ({
  AccountSummaryBar: () => <div>Account Summary Bar</div>,
}))

vi.mock("~/features/ModelList/components/ControlPanel", () => ({
  ControlPanel: () => <div>Control Panel</div>,
}))

vi.mock("~/features/ModelList/components/Footer", () => ({
  Footer: () => <div>Footer</div>,
}))

vi.mock("~/features/ModelList/components/ProviderTabs", () => {
  function MockProviderTabs(props: { children?: ReactNode }) {
    return <div>{props.children}</div>
  }

  return {
    ProviderTabs: MockProviderTabs,
  }
})

vi.mock("~/features/ModelList/components/ModelDisplay", () => ({
  ModelDisplay: () => <div>Model Display</div>,
}))

vi.mock("~/components/dialogs/VerifyApiDialog", () => ({
  VerifyApiDialog: () => null,
}))

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: () => null,
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: () => null,
  }),
)

vi.mock("~/features/ModelList/components/ModelKeyDialog", () => ({
  default: () => null,
}))

function buildState(overrides: Record<string, unknown> = {}) {
  return {
    accounts: [],
    profiles: [],
    selectedSource: null,
    currentAccount: null,
    sourceCapabilities: {
      supportsPricing: false,
      supportsAccountSummary: false,
    },
    selectedSourceValue: "",
    setSelectedSourceValue: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectedProvider: "all",
    setSelectedProvider: vi.fn(),
    selectedGroups: [],
    setSelectedGroups: vi.fn(),
    showRealPrice: false,
    setShowRealPrice: vi.fn(),
    showRatioColumn: false,
    setShowRatioColumn: vi.fn(),
    showEndpointTypes: false,
    setShowEndpointTypes: vi.fn(),
    pricingData: null,
    pricingContexts: [],
    isLoading: false,
    dataFormatError: false,
    loadErrorMessage: null,
    accountFallback: null,
    isFallbackCatalogActive: false,
    filteredModels: [],
    baseFilteredModels: [],
    availableGroups: [],
    loadPricingData: vi.fn(),
    getProviderFilteredCount: vi.fn(() => 0),
    accountQueryStates: [],
    allAccountsFilterAccountId: null,
    setAllAccountsFilterAccountId: vi.fn(),
    ...overrides,
  }
}

describe("ModelList empty-state actions", () => {
  beforeEach(() => {
    mockUseModelListData.mockReset()
    vi.mocked(pushWithinOptionsPage).mockReset()
  })

  it("routes the no-source CTAs to account and API credential setup", async () => {
    const user = userEvent.setup()
    mockUseModelListData.mockReturnValue(buildState())

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", {
        name: "account:addFirstAccount",
      }),
    )
    expect(pushWithinOptionsPage).toHaveBeenCalledWith("#account")

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.add",
      }),
    )
    expect(pushWithinOptionsPage).toHaveBeenCalledWith("#apiCredentialProfiles")
  })

  it("opens the source selector when sources exist but nothing is selected", async () => {
    const user = userEvent.setup()
    mockUseModelListData.mockReturnValue(
      buildState({
        accounts: [{ id: "acc-1", name: "Primary Account" }],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const selectorTrigger = await screen.findByRole("combobox")
    expect(selectorTrigger).toHaveAttribute("aria-expanded", "false")

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:selectSource",
      }),
    )

    await waitFor(() =>
      expect(selectorTrigger).toHaveAttribute("aria-expanded", "true"),
    )
  })
})
