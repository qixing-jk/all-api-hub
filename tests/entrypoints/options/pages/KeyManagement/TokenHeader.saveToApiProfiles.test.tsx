import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenHeader } from "~/features/KeyManagement/components/TokenListItem/TokenHeader"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
} from "~/services/managedSites/tokenChannelStatus"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockCreateProfile = vi.fn()
const mockOpenApiCredentialProfilesPage = vi.fn()
const mockOpenWithAccount = vi.fn()

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
    dismiss: vi.fn(),
  },
}))

vi.mock("~/utils/navigation", () => ({
  openApiCredentialProfilesPage: (...args: unknown[]) =>
    mockOpenApiCredentialProfilesPage(...args),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => {
  return {
    ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
    useChannelDialog: () => ({
      openWithAccount: mockOpenWithAccount,
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
 * Creates an account stub for tests.
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
    mockOpenApiCredentialProfilesPage.mockReset()
    mockOpenWithAccount.mockReset()
    ;(toast.success as any).mockReset()
    ;(toast.error as any).mockReset()
    ;(toast.dismiss as any).mockReset()
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

  it("provides a quick-open button after saving", async () => {
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
      expect(toast.success).toHaveBeenCalled()
    })

    const toastMessageRenderer = (toast.success as any).mock.calls[0]?.[0]
    expect(toastMessageRenderer).toEqual(expect.any(Function))

    render(toastMessageRenderer({ id: "toast-1" }))

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.openApiProfiles",
      }),
    )

    expect(mockOpenApiCredentialProfilesPage).toHaveBeenCalledTimes(1)
    expect(toast.dismiss).toHaveBeenCalledWith("toast-1")
  })

  it("renders managed-site status copy and follow-up link when a weak match exists", async () => {
    const account = createAccountStub()

    const token = {
      id: 2,
      user_id: 1,
      key: "sk-weak",
      status: 1,
      name: "Weak Match Token",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 0,
      accountId: account.id,
      accountName: account.name,
    }

    render(
      <TokenHeader
        token={token as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
        managedSiteStatus={{
          status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
          reason:
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.URL_MODELS_MATCH_ONLY,
          matchedChannel: {
            id: 88,
            name: "Managed Channel 88",
          },
        }}
      />,
    )

    expect(
      screen.getByText("keyManagement:managedSiteStatus.badges.unknown"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /keyManagement:managedSiteStatus\.descriptions\.urlModelsMatchOnly .*keyManagement:managedSiteStatus\.descriptions\.newApiRetrieveKeyHint/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Manage channel/i }),
    ).toHaveTextContent("Managed Channel 88")
  })

  it("renders the exact-match explanation when the token is already added", async () => {
    const account = createAccountStub()

    const token = {
      id: 4,
      user_id: 1,
      key: "sk-added",
      status: 1,
      name: "Added Token",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 0,
      accountId: account.id,
      accountName: account.name,
    }

    render(
      <TokenHeader
        token={token as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
        managedSiteStatus={{
          status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
          matchedChannel: {
            id: 99,
            name: "Managed Channel 99",
          },
        }}
      />,
    )

    expect(
      screen.getByText("keyManagement:managedSiteStatus.badges.added"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:managedSiteStatus.descriptions.exactKeyMatch",
      ),
    ).toBeInTheDocument()
  })

  it("adds the New API 2FA hint when exact key verification is unavailable", async () => {
    const account = createAccountStub()

    const token = {
      id: 5,
      user_id: 1,
      key: "sk-newapi-hint",
      status: 1,
      name: "New API Hint Token",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 0,
      accountId: account.id,
      accountName: account.name,
    }

    render(
      <TokenHeader
        token={token as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
        managedSiteStatus={{
          status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
          reason:
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
        }}
      />,
    )

    expect(
      screen.getByText(
        /keyManagement:managedSiteStatus\.descriptions\.exactVerificationUnavailable/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /keyManagement:managedSiteStatus\.descriptions\.newApiRetrieveKeyHint/,
      ),
    ).toBeInTheDocument()
  })

  it("refreshes the token status after a successful managed-site import", async () => {
    const user = userEvent.setup()
    const account = createAccountStub()
    const onManagedSiteImportSuccess = vi.fn()

    const token = {
      id: 3,
      user_id: 1,
      key: "sk-import",
      status: 1,
      name: "Import Token",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 0,
      accountId: account.id,
      accountName: account.name,
    }

    mockOpenWithAccount.mockImplementation(
      async (
        _account: DisplaySiteData,
        _token: typeof token,
        onSuccess?: (result: { success: boolean; message: string }) => void,
      ) => {
        onSuccess?.({ success: true, message: "imported" })
      },
    )

    render(
      <TokenHeader
        token={token as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    await waitFor(() => {
      expect(mockOpenWithAccount).toHaveBeenCalled()
      expect(onManagedSiteImportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3 }),
      )
    })
  })
})
