import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Tabs } from "~/components/ui"
import ModelList from "~/entrypoints/options/pages/ModelList"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import { MODEL_GROUP_ACCESS_STATES } from "~/features/ModelList/groupContext"
import type { CalculatedModelItem } from "~/features/ModelList/hooks/useFilteredModels"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
  MODEL_LIST_GROUP_SEMANTICS,
  toAihubmixCatalogFallbackCapabilities,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS } from "~/features/ModelList/verificationResultFilters"
import { MODEL_VENDOR_FILTER_VALUES } from "~/services/models/modelVendor"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const mockUseModelListData = vi.fn()
const mockSetAllAccountsFilterAccountIds = vi.fn()
const mockAccountSelector = vi.fn()
const mockTrackProductAnalyticsActionStarted = vi.fn()
const mockTrackProductAnalyticsActionCompleted = vi.fn()

vi.mock("~/features/ModelList/hooks/useModelListData", () => ({
  useModelListData: (...args: any[]) => mockUseModelListData(...args),
}))

vi.mock("~/services/verification/verificationResultHistory", () => ({
  createAccountModelVerificationHistoryTarget: vi.fn(() => "account-target"),
  createProfileModelVerificationHistoryTarget: vi.fn(() => "profile-target"),
  serializeVerificationHistoryTarget: vi.fn((target) => String(target)),
  getVerificationSummaryLatencyMs: vi.fn(() => null),
  useVerificationResultHistorySummaries: vi.fn(() => ({
    summariesByKey: {},
  })),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    mockTrackProductAnalyticsActionStarted(...args),
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    mockTrackProductAnalyticsActionCompleted(...args),
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Primary Account",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
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

type ModelItemFixture = {
  model: { enable_groups?: string[] }
  source: Pick<CalculatedModelItem["source"], "groupSemantics">
  effectiveGroup?: string
}

function withGroupContexts<T extends ModelItemFixture>(
  fixture: T,
): T & Pick<CalculatedModelItem, "groupContext" | "activeGroupContext"> {
  const isGroupAware =
    fixture.source.groupSemantics !== MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE
  const supportedGroups =
    fixture.model.enable_groups ?? (isGroupAware ? ["default"] : [])
  const usableGroups = isGroupAware ? supportedGroups : []
  const activeUsableGroups = isGroupAware ? usableGroups : []
  const activePriceableGroups = isGroupAware ? usableGroups : []
  const actionGroups =
    fixture.effectiveGroup &&
    activeUsableGroups.includes(fixture.effectiveGroup)
      ? [fixture.effectiveGroup]
      : activeUsableGroups

  return {
    ...fixture,
    groupContext: {
      accessState: isGroupAware
        ? MODEL_GROUP_ACCESS_STATES.KNOWN
        : MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
      supportedGroups,
      usableGroups,
      priceableGroups: usableGroups,
    },
    activeGroupContext: {
      activeUsableGroups,
      activePriceableGroups,
      actionGroups,
    },
  }
}

vi.mock("~/features/ModelList/components/AccountSelector", () => ({
  AccountSelector: (props: any) => {
    mockAccountSelector(props)
    return <div>Account Selector</div>
  },
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
        <div key={`status-${item.accountId}`}>
          Summary Status {item.name}:
          {item.isLoading ? "loading" : item.errorType ?? item.count}
        </div>
      ))}
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

vi.mock("~/features/ModelList/components/BatchVerifyModelsDialog", () => ({
  BatchVerifyModelsDialog: ({ items, onClose }: any) => (
    <div>
      <div>Batch Verify Dialog {items.length}</div>
      <button type="button" onClick={onClose}>
        Close batch verify
      </button>
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/ControlPanel", () => ({
  ControlPanel: ({ totalModels, filteredModels, onBatchVerifyModels }: any) => (
    <div>
      Control Panel total:{totalModels} filtered:{filteredModels.length}
      {onBatchVerifyModels ? (
        <button type="button" onClick={onBatchVerifyModels}>
          Batch verify
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock("~/features/ModelList/components/Footer", () => ({
  Footer: ({ showPricingNote }: any) => (
    <div>Footer pricing:{String(showPricingNote)}</div>
  ),
}))

vi.mock("~/features/ModelList/components/ProviderTabs", () => ({
  ProviderTabs: ({ children, effectiveSelectedVendor }: any) => (
    <Tabs value={effectiveSelectedVendor}>{children}</Tabs>
  ),
}))

vi.mock("~/features/ModelList/components/ModelDisplay", () => ({
  ModelDisplay: ({
    models,
    onVerifyModel,
    onVerifyCliSupport,
    onOpenModelKeyDialog,
    onFilterAccount,
  }: any) => (
    <div>
      <div>
        Visible models:
        {models.map((item: any) => item.model.model_name).join(",")}
      </div>
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
  const state: Record<string, any> = {
    accounts: [ACCOUNT, SECOND_ACCOUNT],
    profiles: [PROFILE],
    selectedSource: ACCOUNT_SOURCE,
    currentAccount: ACCOUNT,
    sourceCapabilities: ACCOUNT_SOURCE.capabilities,

    selectedSourceValue: ACCOUNT_SOURCE.value,
    setSelectedSourceValue: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectedProvider: MODEL_VENDOR_FILTER_VALUES.All,
    setSelectedProvider: vi.fn(),
    effectiveSelectedVendor: MODEL_VENDOR_FILTER_VALUES.All,
    shouldRepairSelectedVendor: false,
    vendorCatalog: [],
    sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
    setSortMode: vi.fn(),
    selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
    setSelectedBillingMode: vi.fn(),
    selectedGroups: [],
    setSelectedGroups: vi.fn(),
    selectedVerificationResults: DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
    setSelectedVerificationResults: vi.fn(),

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
    allVendorsFilteredCount: 1,
    accountQueryStates: [],
    allAccountsFilterAccountIds: [],
    setAllAccountsFilterAccountIds: mockSetAllAccountsFilterAccountIds,
    ...overrides,
  }
  state.filteredModels = state.filteredModels.map(withGroupContexts)
  state.baseFilteredModels = state.baseFilteredModels.map(withGroupContexts)
  state.getFilteredModels ??= vi.fn(() => state.filteredModels)

  return state
}

describe("ModelList page flows", () => {
  beforeEach(() => {
    mockAccountSelector.mockReset()
    mockSetAllAccountsFilterAccountIds.mockReset()
    mockUseModelListData.mockReset()
    mockTrackProductAnalyticsActionStarted.mockReset()
    mockTrackProductAnalyticsActionCompleted.mockReset()
  })

  it("uses all-vendor rows immediately and repairs a vanished stored vendor without analytics", async () => {
    const setSelectedProvider = vi.fn()
    const openAiVendor = {
      kind: "known",
      key: "known:openai",
      knownId: "openai",
      label: "OpenAI",
      count: 1,
    }
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedProvider: "known:openai",
        setSelectedProvider,
        effectiveSelectedVendor: "known:openai",
        vendorCatalog: [openAiVendor],
        filteredModels: [
          {
            model: { model_name: "gpt-4" },
            source: ACCOUNT_SOURCE,
          },
        ],
      }),
    )

    const { rerender } = render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(await screen.findByText("Visible models:gpt-4")).toBeVisible()

    mockUseModelListData.mockReturnValue(
      buildState({
        selectedProvider: "known:openai",
        setSelectedProvider,
        effectiveSelectedVendor: MODEL_VENDOR_FILTER_VALUES.All,
        shouldRepairSelectedVendor: true,
        vendorCatalog: [
          {
            kind: "known",
            key: "known:anthropic",
            knownId: "anthropic",
            label: "Anthropic",
            count: 1,
          },
        ],
        filteredModels: [
          {
            model: { model_name: "claude-3-5-sonnet" },
            source: ACCOUNT_SOURCE,
          },
        ],
      }),
    )
    rerender(<ModelList />)

    expect(
      await screen.findByText("Visible models:claude-3-5-sonnet"),
    ).toBeVisible()
    expect(screen.queryByText("Visible models:gpt-4")).not.toBeInTheDocument()
    expect(setSelectedProvider).toHaveBeenCalledWith(
      MODEL_VENDOR_FILTER_VALUES.All,
    )
    expect(mockTrackProductAnalyticsActionCompleted).not.toHaveBeenCalled()
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
    expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

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

  it("shows the AIHubMix catalog fallback notice separately from account-key fallback", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        isFallbackCatalogActive: false,
        isAihubmixCatalogFallbackActive: true,
        pricingData: {
          success: true,
          data: [{ model_name: "gpt-aihubmix" }],
          group_ratio: {},
          usable_group: {},
        },
        baseFilteredModels: [
          {
            model: { model_name: "gpt-aihubmix" },
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
      await screen.findByText("modelList:aihubmixCatalogFallbackNotice.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelList:aihubmixCatalogFallbackNotice.description"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:fallbackSourceNotice.title"),
    ).not.toBeInTheDocument()
  })

  it("labels runtime-key fallback catalogs separately from token-management fallback catalogs", async () => {
    const sharedChatAccount = {
      ...ACCOUNT,
      siteType: "sharedchat",
    }

    mockUseModelListData.mockReturnValue(
      buildState({
        currentAccount: sharedChatAccount,
        selectedSource: createAccountSource(sharedChatAccount),
        sourceCapabilities: createAccountSource(sharedChatAccount).capabilities,
        isFallbackCatalogActive: true,
        fallbackRuntimeKeyName: "SharedChat service credential",
        pricingData: {
          success: true,
          data: [{ model_name: "gpt-runtime" }],
          group_ratio: {},
          usable_group: {},
        },
        baseFilteredModels: [
          {
            model: { model_name: "gpt-runtime" },
            source: createAccountSource(sharedChatAccount),
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("modelList:runtimeKeyFallbackSourceNotice.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelList:runtimeKeyFallbackSourceNotice.description", {
        exact: false,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:fallbackSourceNotice.title"),
    ).not.toBeInTheDocument()
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

  it("omits all-accounts summary items for accounts without eligible summary rows", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ accountId: ACCOUNT.id }],
        accountSummaryCountsByAccountId: new Map([[SECOND_ACCOUNT.id, 1]]),
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
      await screen.findByRole("button", { name: "Summary Backup Account:1" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Summary Primary Account:0" }),
    ).not.toBeInTheDocument()
  })

  it("forwards loading and error states to the account summary bar instead of falling back to counts", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ accountId: ACCOUNT.id }],
        accountSummaryCountsByAccountId: new Map([
          [ACCOUNT.id, 0],
          [SECOND_ACCOUNT.id, 0],
        ]),
        accountQueryStates: [
          { account: ACCOUNT, isLoading: true, errorType: null },
          {
            account: SECOND_ACCOUNT,
            isLoading: false,
            errorType: "load-failed",
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("Summary Status Primary Account:loading"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Summary Status Backup Account:load-failed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("Summary Status Primary Account:0")).toBeNull()
    expect(screen.queryByText("Summary Status Backup Account:0")).toBeNull()
  })

  it("sorts the account selector and summary badges after all-account refreshes settle", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [
          { account: ACCOUNT, pricing: { data: [{ model_name: "gpt-4" }] } },
          {
            account: SECOND_ACCOUNT,
            pricing: {
              data: [
                { model_name: "gpt-4o-mini" },
                { model_name: "claude-3-5-sonnet" },
              ],
            },
          },
        ],
        accountSummaryCountsByAccountId: new Map([
          [ACCOUNT.id, 1],
          [SECOND_ACCOUNT.id, 2],
        ]),
        accountQueryStates: [
          {
            account: ACCOUNT,
            isLoading: false,
            hasError: false,
            errorType: undefined,
          },
          {
            account: SECOND_ACCOUNT,
            isLoading: false,
            hasError: false,
            errorType: undefined,
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findByText("Account Summary Bar active:none")

    expect(mockAccountSelector).toHaveBeenCalled()
    expect(
      mockAccountSelector.mock.calls
        .at(-1)?.[0]
        .accounts.map((account: any) => account.id),
    ).toEqual([SECOND_ACCOUNT.id, ACCOUNT.id])
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.textContent?.startsWith("Summary "))
        .map((button) => button.textContent),
    ).toEqual(["Summary Backup Account:2", "Summary Primary Account:1"])
  })

  it("keeps the original account order while all-account refreshes are still loading", async () => {
    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [{ account: ACCOUNT, pricing: { data: [] } }],
        accountSummaryCountsByAccountId: new Map([
          [ACCOUNT.id, 1],
          [SECOND_ACCOUNT.id, 3],
        ]),
        accountQueryStates: [
          {
            account: ACCOUNT,
            isLoading: false,
            hasError: false,
            errorType: undefined,
          },
          {
            account: SECOND_ACCOUNT,
            isLoading: true,
            hasError: false,
            errorType: undefined,
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findByText("Account Summary Bar active:none")

    expect(
      mockAccountSelector.mock.calls
        .at(-1)?.[0]
        .accounts.map((account: any) => account.id),
    ).toEqual([ACCOUNT.id, SECOND_ACCOUNT.id])
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.textContent?.startsWith("Summary "))
        .map((button) => button.textContent),
    ).toEqual(["Summary Primary Account:1", "Summary Backup Account:3"])
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
    expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelPricingData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
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
      await screen.findByRole("button", { name: "common:status.refreshing" }),
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

  it("opens batch verification with the current filtered model snapshot", async () => {
    const user = userEvent.setup()
    mockUseModelListData.mockReturnValue(
      buildState({
        filteredModels: [
          {
            model: { model_name: "gpt-4", enable_groups: ["default"] },
            source: ACCOUNT_SOURCE,
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Batch verify" }),
    )

    expect(await screen.findByText("Batch Verify Dialog 1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close batch verify" }))
    expect(screen.queryByText("Batch Verify Dialog 1")).toBeNull()
  })

  it("opens batch verification in all-accounts mode with the current filtered model snapshot", async () => {
    const user = userEvent.setup()
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
            pricing: { data: [{ model_name: "gpt-4o" }] },
          },
          {
            account: SECOND_ACCOUNT,
            pricing: { data: [{ model_name: "gpt-4o" }] },
          },
        ],
        filteredModels: [
          {
            model: { model_name: "gpt-4o", enable_groups: ["default"] },
            source: createAccountSource(ACCOUNT),
          },
          {
            model: { model_name: "gpt-4o", enable_groups: ["default"] },
            source: createAccountSource(SECOND_ACCOUNT),
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Batch verify" }),
    )

    expect(await screen.findByText("Batch Verify Dialog 2")).toBeInTheDocument()
  })

  it("omits all-accounts rows that cannot provide verification credentials from batch verification", async () => {
    const user = userEvent.setup()
    const aihubmixSource = createAccountSource({
      ...SECOND_ACCOUNT,
      id: "aihubmix-account",
      name: "AIHubMix",
      siteType: "AIHubMix",
      baseUrl: "https://aihubmix.com",
    })
    const disabledAihubmixSource = {
      ...aihubmixSource,
      capabilities: toAihubmixCatalogFallbackCapabilities(
        aihubmixSource.capabilities,
      ),
    }

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
            pricing: { data: [{ model_name: "gpt-4o" }] },
          },
          {
            account: aihubmixSource.account,
            pricing: { data: [{ model_name: "gpt-aihubmix" }] },
          },
        ],
        filteredModels: [
          {
            model: { model_name: "gpt-4o", enable_groups: ["default"] },
            source: createAccountSource(ACCOUNT),
          },
          {
            model: { model_name: "gpt-aihubmix", enable_groups: [] },
            source: disabledAihubmixSource,
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Batch verify" }),
    )

    expect(await screen.findByText("Batch Verify Dialog 1")).toBeInTheDocument()
  })

  it("hides batch verification when every visible row lacks verification credentials", async () => {
    const aihubmixSource = createAccountSource({
      ...ACCOUNT,
      siteType: "AIHubMix",
      baseUrl: "https://aihubmix.com",
    })
    const disabledAihubmixSource = {
      ...aihubmixSource,
      capabilities: toAihubmixCatalogFallbackCapabilities(
        aihubmixSource.capabilities,
      ),
    }

    mockUseModelListData.mockReturnValue(
      buildState({
        selectedSource: ALL_ACCOUNTS_SOURCE,
        selectedSourceValue: ALL_ACCOUNTS_SOURCE.value,
        currentAccount: null,
        sourceCapabilities: ALL_ACCOUNTS_SOURCE.capabilities,
        pricingData: null,
        pricingContexts: [
          {
            account: aihubmixSource.account,
            pricing: { data: [{ model_name: "gpt-aihubmix" }] },
          },
        ],
        filteredModels: [
          {
            model: { model_name: "gpt-aihubmix", enable_groups: [] },
            source: disabledAihubmixSource,
          },
        ],
      }),
    )

    render(<ModelList />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.queryByRole("button", { name: "Batch verify" })).toBeNull()
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
