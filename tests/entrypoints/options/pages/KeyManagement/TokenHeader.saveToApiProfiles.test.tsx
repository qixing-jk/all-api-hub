import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenHeader } from "~/src/features/KeyManagement/components/TokenListItem/TokenHeader"
import { API_TYPES } from "~/src/services/verification/aiApiVerification"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type DisplaySiteData,
} from "~/src/types"
import { render, screen, waitFor } from "~/tests/test-utils/render"

const mockCreateProfile = vi.fn()
const mockOpenApiCredentialProfilesPage = vi.fn()

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
      openWithAccount: vi.fn(),
    }),
  }
})

const mockedUseUserPreferencesContext = vi.fn()

vi.mock("~/contexts/UserPreferencesContext", async () => {
  const actual = await vi.importActual<
    typeof import("~/src/contexts/UserPreferencesContext")
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
    mockOpenApiCredentialProfilesPage.mockReset()
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
})
