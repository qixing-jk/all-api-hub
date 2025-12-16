import { describe, expect, it, vi } from "vitest"

import { NEW_API, VELOERA } from "~/constants/siteType"
import { TokenHeader } from "~/entrypoints/options/pages/KeyManagement/components/TokenListItem/TokenHeader"
import { TokenDetails } from "~/features/AccountManagement/components/CopyKeyDialog/TokenDetails"
import { render, screen } from "~/tests/test-utils/render"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

vi.mock("~/components/ChannelDialog", () => {
  return {
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

describe("Managed site logo", () => {
  it("renders NewAPI icon when managedSiteType is NEW_API", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: NEW_API,
    })

    const token = {
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
      accountName: "Test Account",
    }

    render(
      <TokenHeader
        token={token}
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

    const token = {
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
      accountName: "Test Account",
    }

    render(
      <TokenHeader
        token={token}
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

  it("renders Veloera logo in CopyKeyDialog token details when managedSiteType is VELOERA", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: VELOERA,
    })

    const token = {
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
    }

    render(
      <TokenDetails
        token={token}
        copiedKey={null}
        onCopyKey={vi.fn()}
        account={createAccountStub()}
      />,
    )

    expect(
      await screen.findByRole("img", { name: "Veloera logo" }),
    ).toBeInTheDocument()
  })
})
