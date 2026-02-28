import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenHeader } from "~/entrypoints/options/pages/KeyManagement/components/TokenListItem/TokenHeader"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const mockCreateProfile = vi.fn()

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) => mockCreateProfile(...args),
    },
  }),
)

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

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

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: any }) => children,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

/**
 *
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
    baseUrl: "https://example.com/v1",
    token: "token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  }
}

describe("TokenHeader save to API profiles", () => {
  beforeEach(() => {
    mockCreateProfile.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "new-api",
      claudeCodeRouterBaseUrl: "",
      claudeCodeRouterApiKey: "",
      cliProxyBaseUrl: "",
      cliProxyManagementKey: "",
    })
  })

  it("creates an openai-compatible profile from token + account baseUrl", async () => {
    const user = userEvent.setup()
    const account = createAccountStub()

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
      accountId: account.id,
      accountName: account.name,
    }

    mockCreateProfile.mockResolvedValue({
      id: "p-1",
      name: token.name,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: account.baseUrl,
      apiKey: token.key,
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    render(
      <TokenHeader
        token={token as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    )

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalledWith({
        name: token.name,
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: account.baseUrl,
        apiKey: token.key,
        tagIds: [],
      })
    })
  })
})
