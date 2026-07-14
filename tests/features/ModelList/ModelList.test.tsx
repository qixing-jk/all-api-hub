import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelList from "~/features/ModelList/ModelList"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"

const { mockUseModelListData, openKeysPageMock, replaceWithinOptionsPageMock } =
  vi.hoisted(() => ({
    mockUseModelListData: vi.fn(),
    openKeysPageMock: vi.fn(),
    replaceWithinOptionsPageMock: vi.fn(),
  }))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("~/features/ModelList/hooks/useModelListData", () => ({
  useModelListData: (...args: unknown[]) => mockUseModelListData(...args),
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openKeysPage: openKeysPageMock,
    replaceWithinOptionsPage: replaceWithinOptionsPageMock,
  }
})

vi.mock(
  "~/services/verification/verificationResultHistory",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/verification/verificationResultHistory")
      >()

    return {
      ...original,
      useVerificationResultHistorySummaries: () => ({ summariesByKey: {} }),
    }
  },
)

vi.mock("~/features/ModelList/components/AccountSelector", () => ({
  AccountSelector: ({
    setSelectedSourceValue,
  }: {
    setSelectedSourceValue: (value: string) => void
  }) => (
    <div data-testid="account-selector">
      <button
        type="button"
        onClick={() => setSelectedSourceValue("account:account-1")}
      >
        select-account-source
      </button>
      <button
        type="button"
        onClick={() => setSelectedSourceValue("profile:profile-1")}
      >
        select-profile-source
      </button>
      <button
        type="button"
        onClick={() => setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)}
      >
        select-all-sources
      </button>
      <button type="button" onClick={() => setSelectedSourceValue("")}>
        clear-source
      </button>
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/AccountSummaryBar", () => ({
  AccountSummaryBar: () => <div data-testid="account-summary-bar" />,
}))

vi.mock("~/features/ModelList/components/BatchVerifyModelsDialog", () => ({
  BatchVerifyModelsDialog: () => <div data-testid="batch-verify-dialog" />,
}))

vi.mock("~/features/ModelList/components/ControlPanel", () => ({
  ControlPanel: ({
    getFilteredResultCount,
  }: {
    getFilteredResultCount?: (filters: {
      searchTerm?: string
      selectedVerificationResults?: string[]
    }) => number
  }) => (
    <div>
      <button
        type="button"
        data-testid="control-panel"
        onClick={() =>
          getFilteredResultCount?.({
            searchTerm: "target",
            selectedVerificationResults: ["pass"],
          })
        }
      >
        control-panel
      </button>
      <button
        type="button"
        data-testid="base-count-control"
        onClick={() =>
          getFilteredResultCount?.({
            searchTerm: "target",
          })
        }
      >
        base-count-control
      </button>
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/Footer", () => ({
  Footer: () => <div data-testid="model-list-footer" />,
}))

vi.mock("~/features/ModelList/components/ProviderTabs", async () => {
  const { Tabs } = await import("~/components/ui")

  return {
    ProviderTabs: ({ children }: { children: ReactNode }) => (
      <Tabs value="all">
        <div data-testid="provider-tabs">{children}</div>
      </Tabs>
    ),
  }
})

vi.mock("~/features/ModelList/components/StatusIndicator", () => ({
  StatusIndicator: () => <div data-testid="status-indicator" />,
}))

vi.mock("~/features/ModelList/components/ModelDisplay", () => ({
  ModelDisplay: ({
    onVerifyModel,
  }: {
    onVerifyModel?: (...args: any[]) => void
  }) => (
    <button
      type="button"
      onClick={() => onVerifyModel?.(ACCOUNT_SOURCE, "gpt-test", ["vip"])}
    >
      open-api-verification
    </button>
  ),
}))

vi.mock("~/components/dialogs/VerifyApiDialog", () => ({
  VerifyApiDialog: ({
    initialModelId,
    modelEnableGroups,
    onManageModelKey,
  }: {
    initialModelId?: string
    modelEnableGroups?: string[]
    onManageModelKey?: () => void
  }) => (
    <div data-testid="verify-api-dialog">
      <span>{initialModelId}</span>
      <span>{modelEnableGroups?.join(",")}</span>
      <button type="button" onClick={onManageModelKey}>
        manage-model-key
      </button>
    </div>
  ),
}))

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: () => <div data-testid="verify-cli-dialog" />,
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: () => (
      <div data-testid="verify-profile-dialog" />
    ),
  }),
)

vi.mock("~/features/ModelList/components/ModelKeyDialog", () => ({
  default: ({
    modelId,
    modelEnableGroups,
    onClose,
  }: {
    modelId: string
    modelEnableGroups: string[]
    onClose: () => void
  }) => (
    <div data-testid={MODEL_LIST_TEST_IDS.modelKeyDialog}>
      <span>{modelId}</span>
      <span>{modelEnableGroups.join(",")}</span>
      <button type="button" onClick={onClose}>
        close-model-key
      </button>
    </div>
  ),
}))

const ACCOUNT = {
  id: "account-1",
  name: "Account One",
  username: "user",
  baseUrl: "https://example.com",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: "healthy" },
  token: "account-token",
  userId: "1",
  authType: "access_token",
  checkIn: { enableDetection: false },
} as any

const CAPABILITIES = {
  supportsPricing: true,
  supportsRatioDisplay: true,
  supportsGroupFiltering: true,
  supportsAccountSummary: false,
  supportsTokenCompatibility: true,
  supportsCredentialVerification: true,
  supportsBatchCredentialVerification: true,
  supportsCliVerification: true,
}

const ACCOUNT_SOURCE = {
  kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
  value: "account:account-1",
  account: ACCOUNT,
  capabilities: CAPABILITIES,
} as any

const PROFILE = {
  id: "profile-1",
  name: "Reusable Key",
  apiType: "openai-compatible",
  baseUrl: "https://profile.example.com",
  apiKey: "sk-example",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
} as any

function createModelListData() {
  return {
    accounts: [ACCOUNT],
    profiles: [],
    selectedSource: ACCOUNT_SOURCE,
    currentAccount: ACCOUNT,
    sourceCapabilities: CAPABILITIES,
    selectedSourceValue: "account:account-1",
    setSelectedSourceValue: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectedProvider: "all",
    setSelectedProvider: vi.fn(),
    sortMode: "default",
    setSortMode: vi.fn(),
    selectedBillingMode: "all",
    setSelectedBillingMode: vi.fn(),
    selectedGroups: ["vip"],
    setSelectedGroups: vi.fn(),
    allAccountsExcludedGroupsByAccountId: {},
    setAllAccountsExcludedGroupsByAccountId: vi.fn(),
    showRealPrice: false,
    setShowRealPrice: vi.fn(),
    showRatioColumn: false,
    setShowRatioColumn: vi.fn(),
    showEndpointTypes: false,
    setShowEndpointTypes: vi.fn(),
    pricingData: {
      data: [
        {
          model_name: "gpt-test",
          quota_type: 0,
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["vip"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { vip: 1 },
      success: true,
      usable_group: {},
    },
    pricingContexts: [],
    isLoading: false,
    dataFormatError: null,
    unsupportedSource: false,
    loadErrorMessage: null,
    accountFallback: null,
    isFallbackCatalogActive: false,
    isAihubmixCatalogFallbackActive: false,
    filteredModels: [],
    accountSummaryCountsByAccountId: new Map(),
    allProvidersFilteredCount: 1,
    getFilteredResultCount: vi.fn(() => 1),
    availableGroups: ["vip"],
    availableAccountGroupsByAccountId: {},
    availableAccountGroupOptionsByAccountId: {},
    loadPricingData: vi.fn(),
    getProviderFilteredCount: vi.fn(() => 1),
    accountQueryStates: [],
    allAccountsFilterAccountIds: [],
    setAllAccountsFilterAccountIds: vi.fn(),
  }
}

describe("ModelList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseModelListData.mockReturnValue(createModelListData())
  })

  it("opens key management for the selected account from the title action", async () => {
    const user = userEvent.setup()

    render(<ModelList />)

    await user.click(
      within(screen.getByTestId(MODEL_LIST_TEST_IDS.titleActions)).getByTestId(
        MODEL_LIST_TEST_IDS.openSelectedAccountKeysButton,
      ),
    )

    expect(openKeysPageMock).toHaveBeenCalledWith(ACCOUNT.id)
  })

  it.each([
    ["select-account-source", "account:account-1", { accountId: ACCOUNT.id }],
    ["select-profile-source", "profile:profile-1", { profileId: PROFILE.id }],
    [
      "select-all-sources",
      ALL_ACCOUNTS_SOURCE_VALUE,
      { accountId: ALL_ACCOUNTS_SOURCE_VALUE },
    ],
    ["clear-source", "", undefined],
  ])(
    "replaces the model-list route when the user chooses %s",
    async (buttonName, selectedValue, expectedParams) => {
      const user = userEvent.setup()
      const setSelectedSourceValue = vi.fn()
      mockUseModelListData.mockReturnValue({
        ...createModelListData(),
        profiles: [PROFILE],
        setSelectedSourceValue,
      })

      render(<ModelList />)

      await user.click(screen.getByRole("button", { name: buttonName }))

      expect(setSelectedSourceValue).toHaveBeenCalledWith(selectedValue)
      expect(replaceWithinOptionsPageMock).toHaveBeenCalledWith(
        "#models",
        expectedParams,
      )
    },
  )

  it("does not show the key-management title shortcut for non-account sources", () => {
    mockUseModelListData.mockReturnValue({
      ...createModelListData(),
      selectedSource: {
        kind: MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
        value: "all-accounts",
        capabilities: CAPABILITIES,
      },
      selectedSourceValue: "all-accounts",
      currentAccount: null,
      pricingContexts: [],
      pricingData: null,
    })

    render(<ModelList />)

    expect(
      within(
        screen.getByTestId(MODEL_LIST_TEST_IDS.titleActions),
      ).queryByTestId(MODEL_LIST_TEST_IDS.openSelectedAccountKeysButton),
    ).not.toBeInTheDocument()
  })

  it("opens the model key dialog from an incompatible API verification token state", async () => {
    const user = userEvent.setup()
    render(<ModelList />)

    await user.click(
      screen.getAllByRole("button", { name: "open-api-verification" })[0],
    )
    expect(screen.getByTestId("verify-api-dialog")).toHaveTextContent(
      "gpt-test",
    )
    expect(screen.getByTestId("verify-api-dialog")).toHaveTextContent("vip")

    await user.click(screen.getByRole("button", { name: "manage-model-key" }))

    expect(screen.queryByTestId("verify-api-dialog")).not.toBeInTheDocument()
    expect(
      screen.getByTestId(MODEL_LIST_TEST_IDS.modelKeyDialog),
    ).toHaveTextContent("gpt-test")
    expect(
      screen.getByTestId(MODEL_LIST_TEST_IDS.modelKeyDialog),
    ).toHaveTextContent("vip")

    await user.click(screen.getByRole("button", { name: "close-model-key" }))

    expect(
      screen.queryByTestId(MODEL_LIST_TEST_IDS.modelKeyDialog),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("verify-api-dialog")).toHaveTextContent(
      "gpt-test",
    )
    expect(screen.getByTestId("verify-api-dialog")).toHaveTextContent("vip")
  })

  it("estimates verification result counts from pending base filters", async () => {
    const user = userEvent.setup()
    const getFilteredModels = vi.fn((filters?: { searchTerm?: string }) => {
      const matchingModelName =
        filters?.searchTerm === "target" ? "gpt-target" : "gpt-other"
      return [
        {
          model: {
            model_name: matchingModelName,
            quota_type: 0,
            model_ratio: 1,
            model_price: 0,
            completion_ratio: 1,
            enable_groups: ["vip"],
            supported_endpoint_types: [],
          },
          source: ACCOUNT_SOURCE,
          calculatedPrice: {},
          groupRatios: {},
        },
      ]
    })

    mockUseModelListData.mockReturnValue({
      ...createModelListData(),
      filteredModels: getFilteredModels(),
      getFilteredModels,
      getFilteredResultCount: vi.fn(() => 1),
    })

    render(<ModelList />)

    await user.click(screen.getByTestId("control-panel"))

    expect(getFilteredModels).toHaveBeenCalledWith({
      searchTerm: "target",
    })
  })

  it("uses the base count for non-verification result estimates", async () => {
    const user = userEvent.setup()
    const getFilteredModels = vi.fn(() => [])
    const getFilteredResultCount = vi.fn(() => 3)

    mockUseModelListData.mockReturnValue({
      ...createModelListData(),
      getFilteredModels,
      getFilteredResultCount,
    })

    render(<ModelList />)

    await user.click(screen.getByTestId("base-count-control"))

    expect(getFilteredResultCount).toHaveBeenCalledWith({
      searchTerm: "target",
    })
    expect(getFilteredModels).not.toHaveBeenCalled()
  })
})
