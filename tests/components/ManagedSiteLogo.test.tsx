import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { AXON_HUB, NEW_API, VELOERA } from "~/constants/siteType"
import { TokenDetails } from "~/features/AccountManagement/components/CopyKeyDialog/TokenDetails"
import { TokenHeader } from "~/features/KeyManagement/components/TokenListItem/TokenHeader"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
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
    health: { status: SiteHealthStatus.Healthy },
    siteType: "new-api",
    baseUrl: "https://example.com",
    token: "token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
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

describe("Managed site logo", () => {
  it("renders NewAPI icon when managedSiteType is NEW_API", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: NEW_API,
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

    expect(screen.queryByRole("img", { name: "Veloera logo" })).toBeNull()
  })

  it("renders Veloera logo when managedSiteType is VELOERA", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: VELOERA,
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
      await screen.findByRole("img", { name: "Veloera logo" }),
    ).toBeInTheDocument()
  })

  it("renders AxonHub logo when managedSiteType is AXON_HUB", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: AXON_HUB,
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
      await screen.findByRole("img", { name: "AxonHub logo" }),
    ).toBeInTheDocument()
  })

  it("renders Veloera logo in CopyKeyDialog token details when managedSiteType is VELOERA", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: VELOERA,
    })

    render(
      <TokenDetails
        token={createTokenStub({
          accountId: undefined,
          accountName: undefined,
        })}
        copiedTokenId={null}
        onCopyKey={vi.fn()}
        account={createAccountStub()}
      />,
    )

    expect(
      await screen.findByRole("img", { name: "Veloera logo" }),
    ).toBeInTheDocument()
  })
})
