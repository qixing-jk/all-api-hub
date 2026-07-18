import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelItem from "~/features/ModelList/components/ModelItem"
import {
  MODEL_GROUP_ACCESS_STATES,
  type ActiveModelGroupContext,
  type ModelGroupContext,
} from "~/features/ModelList/groupContext"
import {
  createAccountSource,
  createProfileSource,
  toAihubmixCatalogFallbackCapabilities,
  toCatalogOnlyCapabilities,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { render, screen } from "~~/tests/test-utils/render"

const mockCreateTab = vi.hoisted(() => vi.fn())

const NOT_APPLICABLE_GROUP_CONTEXT: ModelGroupContext = {
  accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
  supportedGroups: [],
  usableGroups: [],
  priceableGroups: [],
}

const EMPTY_ACTIVE_GROUP_CONTEXT: ActiveModelGroupContext = {
  activeUsableGroups: [],
  activePriceableGroups: [],
  actionGroups: [],
}

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    createTab: mockCreateTab,
  }
})

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "light",
      updateThemeMode: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

describe("ModelItem profile actions", () => {
  beforeEach(() => {
    mockCreateTab.mockReset()
  })

  it("exposes credential-based API and CLI verification for profile-backed rows", async () => {
    const user = userEvent.setup()
    const onVerifyModel = vi.fn()
    const onVerifyCliSupport = vi.fn()

    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{}}
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={profileSource}
        onVerifyModel={onVerifyModel}
        onVerifyCliSupport={onVerifyCliSupport}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyApi",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:actions.keyForModel",
      }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyCliSupport",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:expandDetails",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyApi",
      }),
    )

    expect(onVerifyModel).toHaveBeenCalledWith(
      profileSource,
      "gpt-4o-mini",
      undefined,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyCliSupport",
      }),
    )

    expect(onVerifyCliSupport).toHaveBeenCalledWith(
      profileSource,
      "gpt-4o-mini",
    )
  })

  it("shows persisted verification status for a profile-backed row", async () => {
    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    const target = createProfileModelVerificationHistoryTarget(
      "profile-1",
      "gpt-4o-mini",
    )
    if (!target) {
      throw new Error("Expected history target")
    }

    const verificationSummary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 12,
          summary: "Stored model history",
        },
      ],
    })

    if (!verificationSummary) {
      throw new Error("Expected verification summary")
    }

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{}}
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={profileSource}
        verificationSummary={verificationSummary}
        onVerifyModel={() => {}}
        onVerifyCliSupport={() => {}}
      />,
    )

    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.status.pass"),
    ).toBeInTheDocument()
  })

  it("avoids rendering duplicate unverified helper copy for rows without verification history", async () => {
    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{}}
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={profileSource}
        onVerifyModel={() => {}}
        onVerifyCliSupport={() => {}}
      />,
    )

    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.status.unverified",
      ),
    ).toBeInTheDocument()
  })

  it("falls back to the raw profile baseUrl when the URL is malformed", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    const profileSource = createProfileSource({
      id: "profile-legacy",
      name: "Legacy Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "not-a-valid-url",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{}}
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={profileSource}
      />,
    )

    expect(
      await screen.findByText("modelList:sourceLabels.profileBadge"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "modelList:actions.copySiteUrl",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:actions.openSite",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "modelList:actions.copySiteUrl",
      }),
    )

    expect(writeText).toHaveBeenCalledWith("not-a-valid-url")
    expect(mockCreateTab).not.toHaveBeenCalled()
  })

  it("shows the owning account name as the source badge for account-backed rows", async () => {
    const accountSource = createAccountSource({
      id: "account-1",
      name: "Example Account",
      username: "tester",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: SiteHealthStatus.Healthy },
      siteType: "new-api",
      baseUrl: "https://example.com",
      token: "token",
      userId: "1",
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{ default: 1 }}
        effectiveGroup="default"
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={accountSource}
      />,
    )

    const sourceBadge = await screen.findByText("Example Account · example.com")
    expect(sourceBadge).toBeInTheDocument()
    expect(sourceBadge.closest("[data-slot]")).toHaveAttribute(
      "title",
      "https://example.com",
    )
    expect(sourceBadge.closest("button")).toBeNull()
  })

  it("lets callers reuse the source badge as an account-filter shortcut", async () => {
    const user = userEvent.setup()
    const onFilterAccount = vi.fn()

    const accountSource = createAccountSource({
      id: "account-1",
      name: "Example Account",
      username: "tester",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: SiteHealthStatus.Healthy },
      siteType: "new-api",
      baseUrl: "https://example.com",
      token: "token",
      userId: "1",
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{ default: 1 }}
        effectiveGroup="default"
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={accountSource}
        onFilterAccount={onFilterAccount}
      />,
    )

    const sourceBadgeButton = (
      await screen.findByText("Example Account · example.com")
    ).closest("button")
    expect(sourceBadgeButton).not.toBeNull()
    expect(sourceBadgeButton).toHaveAttribute("title", "https://example.com")

    await user.click(sourceBadgeButton!)

    expect(onFilterAccount).toHaveBeenCalledWith(accountSource.account.id)
  })

  it("renders account-key fallback rows as catalog-only cards", async () => {
    const accountSource = createAccountSource({
      id: "account-1",
      name: "Example Account",
      username: "tester",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: SiteHealthStatus.Healthy },
      siteType: "new-api",
      baseUrl: "https://example.com",
      token: "token",
      userId: "1",
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "claude-haiku-4-5-20251001",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={true}
        showEndpointTypes={true}
        groupRatios={{ default: 1 }}
        effectiveGroup="default"
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={accountSource}
        displayCapabilities={toCatalogOnlyCapabilities(
          accountSource.capabilities,
        )}
        onVerifyModel={() => {}}
        onVerifyCliSupport={() => {}}
        onOpenModelKeyDialog={() => {}}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "modelList:actions.keyForModel",
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText("ui:tokenBased")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:ratio")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:unavailable")).not.toBeInTheDocument()
    expect(
      screen.queryByText(/modelList:(currentUsableGroups|siteSupportedGroups)/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:expandDetails",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps model-list-only rows visually available while showing unavailable pricing copy", async () => {
    const accountSource = createAccountSource({
      id: "account-model-list-only",
      name: "Example Account",
      username: "tester",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: SiteHealthStatus.Healthy },
      siteType: "new-api",
      baseUrl: "https://example.com",
      token: "token",
      userId: "1",
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "example-runtime-model",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 0,
          enable_groups: [],
          supported_endpoint_types: [],
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.NONE,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
          },
        }}
        calculatedPrice={{
          priceAvailability: "unavailable",
          unavailableReason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={true}
        showEndpointTypes={true}
        groupRatios={{ default: 1 }}
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={accountSource}
      />,
    )

    expect(
      await screen.findByText(
        "modelList:unavailablePriceReasons.modelListOnly",
      ),
    ).toBeInTheDocument()

    expect(screen.queryByText("modelList:available")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:unavailable")).not.toBeInTheDocument()
    expect(
      screen.queryByText(/modelList:clickSwitchGroup/),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole("heading", { name: "example-runtime-model" }),
    ).toHaveClass("text-gray-900")
    expect(
      screen.getByRole("heading", { name: "example-runtime-model" }),
    ).not.toHaveClass("text-gray-500")
  })

  it("hides the model-key action for account catalog fallback rows without token compatibility", async () => {
    const accountSource = createAccountSource({
      id: "account-1",
      name: "Example Account",
      username: "tester",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: SiteHealthStatus.Healthy },
      siteType: "AIHubMix",
      baseUrl: "https://aihubmix.com",
      token: "token",
      userId: "1",
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
    })
    const catalogFallbackSource = {
      ...accountSource,
      capabilities: toAihubmixCatalogFallbackCapabilities(
        accountSource.capabilities,
      ),
    }

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={true}
        showEndpointTypes={true}
        groupRatios={{ default: 1 }}
        effectiveGroup="default"
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        source={catalogFallbackSource}
        displayCapabilities={catalogFallbackSource.capabilities}
        onVerifyModel={() => {}}
        onVerifyCliSupport={() => {}}
        onOpenModelKeyDialog={() => {}}
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "modelList:actions.keyForModel",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:actions.verifyApi",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:actions.verifyCliSupport",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows a lowest-price badge when the row is marked as the cheapest option", async () => {
    const accountSource = createAccountSource({
      id: "account-lowest",
      name: "Cheapest Account",
      username: "tester",
      balance: { USD: 10, CNY: 70 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: SiteHealthStatus.Healthy },
      siteType: "new-api",
      baseUrl: "https://example.com",
      token: "token",
      userId: "1",
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
    })

    render(
      <ModelItem
        resolvedVendor={{ state: "unknown" }}
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 2,
          outputUSD: 2,
          inputCNY: 14,
          outputCNY: 14,
        }}
        exchangeRate={7}
        showRealPrice={true}
        showRatioColumn={false}
        showEndpointTypes={true}
        groupRatios={{ default: 1 }}
        effectiveGroup="default"
        groupContext={NOT_APPLICABLE_GROUP_CONTEXT}
        activeGroupContext={EMPTY_ACTIVE_GROUP_CONTEXT}
        showsOptimalGroup={true}
        source={accountSource}
        isLowestPrice={true}
      />,
    )

    expect(
      await screen.findByText("modelList:optimalGroup"),
    ).toBeInTheDocument()
    expect(screen.getByText("modelList:optimalGroup")).toHaveAttribute(
      "title",
      "modelList:optimalGroupLowestPriceWithinBillingMode",
    )
    expect(screen.queryByText("modelList:lowestPrice")).toBeNull()
  })
})
