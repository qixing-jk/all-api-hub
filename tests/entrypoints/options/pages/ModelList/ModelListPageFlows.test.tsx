import { TabGroup } from "@headlessui/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelList from "~/entrypoints/options/pages/ModelList"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const mockUseModelListData = vi.fn()
const mockSetAllAccountsFilterAccountIds = vi.fn()

vi.mock("~/features/ModelList/hooks/useModelListData", () => ({
  useModelListData: (...args: any[]) => mockUseModelListData(...args),
}))

vi.mock("~/services/models/utils/modelProviders", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/models/utils/modelProviders")
    >()
  return {
    ...actual,
    getAllProviders: () => ["provider-a"],
  }
})

vi.mock("~/services/verification/verificationResultHistory", () => ({
  createAccountModelVerificationHistoryTarget: vi.fn(() => "account-target"),
  createProfileModelVerificationHistoryTarget: vi.fn(() => "profile-target"),
  useVerificationResultHistorySummaries: vi.fn(() => ({
    summariesByKey: {},
  })),
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Primary Account",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as any

const SECOND_ACCOUNT = {
  ...ACCOUNT,
  id: "acc-2",
  name: "Backup Account",
  baseUrl: "https://backup.example.com",
} as any

const PROFILE = {
  id: "profile-1",
  name: "Reusable Key",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://profile.example.com",
  apiKey: "sk-secret",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 2,
} as any

const ACCOUNT_SOURCE = createAccountSource(ACCOUNT)
const ALL_ACCOUNTS_SOURCE = createAllAccountsSource()
const PROFILE_SOURCE = createProfileSource(PROFILE)

vi.mock("~/features/ModelList/components/AccountSelector", () => ({
  AccountSelector: () => <div>Account Selector</div>,
}))

vi.mock("~/features/ModelList/components/StatusIndicator", () => ({
  StatusIndicator: ({ selectedSource, loadPricingData }: any) => (
    <div>
      <div>Status Indicator: {selectedSource?.kind ?? "none"}</div>
      <button type="button" onClick={() => loadPricingData()}>
        Retry load
      </button>
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/AccountSummaryBar", () => ({
  AccountSummaryBar: ({ items, activeAccountIds, onAccountClick }: any) => (
    <div>
      <div>
        Account Summary Bar active:
        {activeAccountIds?.length ? activeAccountIds.join(",") : "none"}
      </div>
      {items.map((item: any) => (
        <button
          key={item.accountId}
          type="button"
          onClick={() => onAccountClick(item.accountId)}
        >
          Summary {item.name}:{item.count}
        </button>
      ))}
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/ControlPanel", () => ({
  ControlPanel: ({ totalModels, filteredModels }: any) => (
    <div>
      Control Panel total:{totalModels} filtered:{filteredModels.length}
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/Footer", () => ({
  Footer: ({ showPricingNote }: any) => (
    <div>Footer pricing:{String(showPricingNote)}</div>
  ),
}))

vi.mock("~/features/ModelList/components/ProviderTabs", () => ({
  ProviderTabs: ({ children }: any) => <TabGroup>{children}</TabGroup>,
}))

vi.mock("~/features/ModelList/components/ModelDisplay", () => ({
  ModelDisplay: ({
    onVerifyModel,
    onVerifyCliSupport,
    onOpenModelKeyDialog,
    onFilterAccount,
  }: any) => (
    <div>
      <button
        type="button"
        onClick={() => onVerifyModel(ACCOUNT_SOURCE, "gpt-4")}
      >
        Verify API account
      </button>
      <button
        type="button"
        onClick={() => onVerifyModel(PROFILE_SOURCE, "claude-3-5-sonnet")}
      >
        Verify API profile
      </button>
      <button
        type="button"
        onClick={() => onVerifyCliSupport(ACCOUNT_SOURCE, "gpt-4")}
      >
        Verify CLI account
      </button>
      <button
        type="button"
        onClick={() => onVerifyCliSupport(PROFILE_SOURCE, "claude-3-5-sonnet")}
      >
        Verify CLI profile
      </button>
      <button
        type="button"
        onClick={() => onOpenModelKeyDialog(ACCOUNT, "gpt-4", ["vip"])}
      >
        Open key dialog
      </button>
      {onFilterAccount && (
        <button type="button" onClick={() => onFilterAccount(ACCOUNT.id)}>
          Filter account
        </button>
      )}
    </div>
  ),
}))

vi.mock("~/components/dialogs/VerifyApiDialog", () => ({
  VerifyApiDialog: ({ account, initialModelId, onClose }: any) => (
    <div>
      <div>
        Verify API Dialog {account.id}:{initialModelId}
      </div>
      <button type="button" onClick={onClose}>
        Close verify API
      </button>
    </div>
  ),
}))

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: ({
    account,
    profile,
    initialModelId,
    onClose,
  }: any) => (
    <div>
      <div>
        Verify CLI Dialog{" "}
        {account ? `account:${account.id}` : `profile:${profile.id}`}:
        {initialModelId}
      </div>
      <button type="button" onClick={onClose}>
        Close verify CLI
      </button>
    </div>
  ),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: ({
      profile,
      initialModelId,
      onClose,
    }: any) => (
      <div>
        <div>
          Verify Profile Dialog {profile.id}:{initialModelId}
        </div>
        <button type="button" onClick={onClose}>
          Close verify profile
        </button>
      </div>
    ),
  }),
)

vi.mock("~/features/ModelList/components/ModelKeyDialog", () => ({
  default: ({ account, modelId, modelEnableGroups, onClose }: any) => (
    <div>
      <div>
        Model Key Dialog {account.id}:{modelId}:{modelEnableGroups.join(",")}
      </div>
      <button type="button" onClick={onClose}>
        Close key dialog
      </button>
    </div>
  ),
}))

function buildState(overrides: Record<string, any> = {}) {
  return {
    accounts: [ACCOUNT, SECOND_ACCOUNT],
    profiles: [PROFILE],
    selectedSource: ACCOUNT_SOURCE,
    currentAccount: ACCOUNT,
    sourceCapabilities: ACCOUNT_SOURCE.capabilities,

    selectedSourceValue: ACCOUNT_SOURCE.value,
    setSelectedSourceValue: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectedProvider: "all",
    setSelectedProvider: vi.fn(),
    sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
    setSortMode: vi.fn(),
    selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
    setSelectedBillingMode: vi.fn(),
    selectedGroups: [],
    setSelectedGroups: vi.fn(),

    showRealPrice: false,
    setShowRealPrice: vi.fn(),
    showRatioColumn: false,
    setShowRatioColumn: vi.fn(),
    showEndpointTypes: false,
    setShowEndpointTypes: vi.fn(),

    pricingData: { data: [{ model_name: "gpt-4" }] },
    pricingContexts: [],
    isLoading: false,
    dataFormatError: false,
    loadErrorMessage: null,
    accountFallback: null,
    isFallbackCatalogActive: false,

    filteredModels: [
      {
        model: { model_name: "gpt-4" },
        source: ACCOUNT_SOURCE,
      },
    ],
    accountSummaryCountsByAccountId: new Map([[ACCOUNT.id, 1]]),
    baseFilteredModels: [
      {
        model: { model_name: "gpt-4" },
        source: ACCOUNT_SOURCE,
      },
    ],
    availableGroups: [],

    loadPricingData: vi.fn(),
    getProviderFilteredCount: vi.fn(() => 0),
    accountQueryStates: [],
    allAccountsFilterAccountIds: [],
    setAllAccountsFilterAccountIds: mockSetAllAccountsFilterAccountIds,
    ...overrides,
  }
}

describe("ModelList page flows", () => {
  beforeEach(() => {
    mockSetAllAccountsFilterAccountIds.mockReset()
    mockUseModelListData.mockReset()
  })

  it("renders the status indicator when a source is selected but model data is still missing", async () => {
    const loadPricingData = vi.fn()
    mockUseModelListData.mockReturnValue(
      buildState({
        pricingData: null,
        loadPricingData,
      }),
    )

    const user = userEvent.setup()

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("Status Indicator: account"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Control Panel total:/)).toBeNull()

    await user.click(screen.getByRole("button", { name: "Retry load" }))
    expect(loadPricingData).toHaveBeenCalledTimes(1)
  })

  it("shows the fallback notice and toggles the all-accounts summary filter", async () => {
    const user = userEvent.setup()

    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ accountId: ACCOUNT.id }],
        isFallbackCatalogActive: true,
        accountSummaryCountsByAccountId: new Map([
          [ACCOUNT.id, 2],
          [SECOND_ACCOUNT.id, 1],
        ]),
        baseFilteredModels: [
          {
            model: { model_name: "gpt-4" },
            source: createAccountSource(ACCOUNT),
          },
          {
            model: { model_name: "claude-3-5-sonnet" },
            source: createAccountSource(ACCOUNT),
          },
          {
            model: { model_name: "gpt-4o-mini" },
            source: createAccountSource(SECOND_ACCOUNT),
          },
        ],
        accountQueryStates: [
          { account: ACCOUNT, errorType: null },
          { account: SECOND_ACCOUNT, errorType: "load_failed" },
        ],
      }),
    )

    const { rerender } = render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("modelList:fallbackSourceNotice.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Account Summary Bar active:none"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "Summary Primary Account:2" }),
    )
    expect(mockSetAllAccountsFilterAccountIds).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(
      mockSetAllAccountsFilterAccountIds.mock.calls.at(-1)?.[0]([]),
    ).toEqual(["acc-1"])

    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ accountId: ACCOUNT.id }],
        isFallbackCatalogActive: true,
        accountSummaryCountsByAccountId: new Map([
          [ACCOUNT.id, 2],
          [SECOND_ACCOUNT.id, 1],
        ]),
        baseFilteredModels: [
          {
            model: { model_name: "gpt-4" },
            source: createAccountSource(ACCOUNT),
          },
        ],
        accountQueryStates: [{ account: ACCOUNT, errorType: null }],
        allAccountsFilterAccountIds: ["acc-1"],
      }),
    )

    rerender(<ModelList />)

    expect(
      await screen.findByText("Account Summary Bar active:acc-1"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "Summary Primary Account:2" }),
    )
    expect(mockSetAllAccountsFilterAccountIds).toHaveBeenCalledTimes(2)
    expect(
      mockSetAllAccountsFilterAccountIds.mock.calls.at(-1)?.[0](["acc-1"]),
    ).toEqual([])
  })

  it("keeps summary counts sourced from the pre-account-filter model set", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ accountId: ACCOUNT.id }],
        allAccountsFilterAccountIds: ["acc-1"],
        accountSummaryCountsByAccountId: new Map([
          [ACCOUNT.id, 2],
          [SECOND_ACCOUNT.id, 1],
        ]),
        baseFilteredModels: [
          {
            model: { model_name: "gpt-4" },
            source: createAccountSource(ACCOUNT),
          },
        ],
        accountQueryStates: [
          { account: ACCOUNT, errorType: null },
          { account: SECOND_ACCOUNT, errorType: null },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByRole("button", { name: "Summary Primary Account:2" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Summary Backup Account:1" }),
    ).toBeInTheDocument()
  })

  it("aggregates total model count from all account pricing contexts", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [
          {
            account: ACCOUNT,
            pricing: {
              data: [{ model_name: "gpt-4" }, { model_name: "gpt-4o-mini" }],
            },
          },
          {
            account: SECOND_ACCOUNT,
            pricing: {
              data: [{ model_name: "claude-3-5-sonnet" }],
            },
          },
        ],
        filteredModels: [
          {
            model: { model_name: "gpt-4" },
            source: createAccountSource(ACCOUNT),
          },
          {
            model: { model_name: "gpt-4o-mini" },
            source: createAccountSource(ACCOUNT),
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("Control Panel total:3 filtered:2"),
    ).toBeInTheDocument()
  })

  it("renders the page-level refresh action in the header and triggers reload", async () => {
    const user = userEvent.setup()
    const loadPricingData = vi.fn()

    mockUseModelListData.mockReturnValue(
      buildState({
        loadPricingData,
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "modelList:refreshData" }),
    )

    expect(loadPricingData).toHaveBeenCalledTimes(1)
  })

  it("keeps the page-level refresh action disabled while loading", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        isLoading: true,
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByRole("button", { name: /modelList:refreshData/i }),
    ).toBeDisabled()
  })

  it("routes account verification and model-key actions through the page dialogs", async () => {
    const user = userEvent.setup()
    mockUseModelListData.mockReturnValue(buildState())

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Verify API account" }),
    )
    expect(
      await screen.findByText("Verify API Dialog acc-1:gpt-4"),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close verify API" }))
    expect(screen.queryByText("Verify API Dialog acc-1:gpt-4")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Open key dialog" }))
    expect(
      await screen.findByText("Model Key Dialog acc-1:gpt-4:vip"),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close key dialog" }))
    expect(screen.queryByText("Model Key Dialog acc-1:gpt-4:vip")).toBeNull()
  })

  it("lets all-accounts rows reuse the top-level account tag filter", async () => {
    const user = userEvent.setup()

    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ accountId: ACCOUNT.id }],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Filter account" }),
    )

    expect(mockSetAllAccountsFilterAccountIds).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(
      mockSetAllAccountsFilterAccountIds.mock.calls.at(-1)?.[0]([]),
    ).toEqual([ACCOUNT.id])
  })

  it("does not expose row account filtering outside the all-accounts view", () => {
    mockUseModelListData.mockReturnValue(buildState())

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.queryByRole("button", { name: "Filter account" })).toBeNull()
  })

  it("routes profile verification and CLI verification to the correct dialog variants", async () => {
    const user = userEvent.setup()
    mockUseModelListData.mockReturnValue(buildState())

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Verify API profile" }),
    )
    expect(
      await screen.findByText(
        "Verify Profile Dialog profile-1:claude-3-5-sonnet",
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Close verify profile" }),
    )

    await user.click(screen.getByRole("button", { name: "Verify CLI account" }))
    expect(
      await screen.findByText("Verify CLI Dialog account:acc-1:gpt-4"),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Close verify CLI" }))

    await user.click(screen.getByRole("button", { name: "Verify CLI profile" }))
    expect(
      await screen.findByText(
        "Verify CLI Dialog profile:profile-1:claude-3-5-sonnet",
      ),
    ).toBeInTheDocument()
  })
})
