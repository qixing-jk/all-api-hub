import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RuntimeKeyDetails } from "~/features/AccountManagement/components/CopyKeyDialog/RuntimeKeyDetails"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { TokenHeaderHarness as TokenHeader } from "~~/tests/test-utils/keyManagement/TokenHeaderHarness"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/components/dialogs/ChannelDialog", () => {
  return {
    ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
    useChannelDialog: () => ({
      openWithAccount: vi.fn(),
    }),
  }
})

const mockedUseUserPreferencesContext = vi.fn()

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", async () => {
  const actual = await vi.importActual<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return new Proxy(actual, {
    get(target, prop) {
      if (prop === "useUserPreferencesContext") {
        return () => mockedUseUserPreferencesContext()
      }
      return (target as any)[prop]
    },
  })
})

/**
 * Creates a minimal DisplaySiteData stub for managed-site import actions.
 */
function createAccountStub(): DisplaySiteData {
  return {
    id: "account-1",
    name: "Test Account",
    username: "user",
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
    checkIn: buildCheckInConfig(),
  }
}

function createTokenStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 1,
    key: "sk-test",
    status: 1,
    name: "Token",
    created_time: 0,
    accessed_time: 0,
    expired_time: 0,
    remain_quota: 0,
    unlimited_quota: false,
    used_quota: 0,
    accountId: "account-1",
    accountName: "Test Account",
    ...overrides,
  }
}

function createRuntimeKeyStub(account = createAccountStub()) {
  return buildServiceCredentialRuntimeKey(account, {
    kind: "singleton_service_key",
    service: "codex",
    label: "Codex",
    key: "sk-service-credential-secret",
    isAuthenticated: true,
    baseUrl: "https://api.example.invalid/v1",
  })
}

describe("Managed site logo", () => {
  it("renders NewAPI icon when managedSiteType is SITE_TYPES.NEW_API", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.NEW_API,
    })

    render(
      <TokenHeader
        token={createTokenStub()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={createAccountStub()}
      />,
    )

    await screen.findByText("Token")
    expect(screen.queryByAltText("Veloera logo")).toBeNull()
  })

  it("renders Veloera logo when managedSiteType is SITE_TYPES.VELOERA", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.VELOERA,
    })

    render(
      <TokenHeader
        token={createTokenStub()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={createAccountStub()}
      />,
    )

    await screen.findByText("Token")
    expect(await screen.findByAltText("Veloera logo")).toBeInTheDocument()
  })

  it("renders AxonHub logo when managedSiteType is SITE_TYPES.AXON_HUB", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.AXON_HUB,
    })

    render(
      <TokenHeader
        token={createTokenStub()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={createAccountStub()}
      />,
    )

    await screen.findByText("Token")
    expect(await screen.findByAltText("AxonHub logo")).toBeInTheDocument()
  })

  it("renders Claude Code Hub logo when managedSiteType is SITE_TYPES.CLAUDE_CODE_HUB", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
    })

    render(
      <TokenHeader
        token={createTokenStub()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={createAccountStub()}
      />,
    )

    await screen.findByText("Token")
    expect(
      await screen.findByAltText("Claude Code Hub logo"),
    ).toBeInTheDocument()
  })

  it("renders Sub2API logo when managedSiteType is SITE_TYPES.SUB2API", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.SUB2API,
    })

    render(
      <TokenHeader
        token={createTokenStub()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={createAccountStub()}
      />,
    )

    await screen.findByText("Token")
    expect(await screen.findByAltText("Sub2API logo")).toBeInTheDocument()
  })

  it("renders Veloera logo in CopyKeyDialog token details when managedSiteType is SITE_TYPES.VELOERA", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.VELOERA,
    })

    render(
      <RuntimeKeyDetails
        runtimeKey={createRuntimeKeyStub()}
        copiedRuntimeKeyId={null}
        onCopyKey={vi.fn()}
        account={createAccountStub()}
      />,
    )

    expect(await screen.findByAltText("Veloera logo")).toBeInTheDocument()
  })

  it("renders Claude Code Hub logo in CopyKeyDialog token details when managedSiteType is SITE_TYPES.CLAUDE_CODE_HUB", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
    })

    render(
      <RuntimeKeyDetails
        runtimeKey={createRuntimeKeyStub()}
        copiedRuntimeKeyId={null}
        onCopyKey={vi.fn()}
        account={createAccountStub()}
      />,
    )

    expect(
      await screen.findByAltText("Claude Code Hub logo"),
    ).toBeInTheDocument()
  })
})
