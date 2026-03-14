import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenHeader } from "~/features/KeyManagement/components/TokenListItem/TokenHeader"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelAssessment,
} from "~/services/managedSites/tokenChannelStatus"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockCreateProfile = vi.fn()
const mockOpenApiCredentialProfilesPage = vi.fn()
const mockOpenManagedSiteChannelsForChannel = vi.fn()
const mockOpenManagedSiteChannelsPage = vi.fn()
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
  openManagedSiteChannelsForChannel: (...args: unknown[]) =>
    mockOpenManagedSiteChannelsForChannel(...args),
  openManagedSiteChannelsPage: (...args: unknown[]) =>
    mockOpenManagedSiteChannelsPage(...args),
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

/**
 * Creates a baseline managed-site assessment that individual tests can override.
 */
function createManagedSiteAssessment(
  overrides: Partial<ManagedSiteTokenChannelAssessment> = {},
): ManagedSiteTokenChannelAssessment {
  const base: ManagedSiteTokenChannelAssessment = {
    searchBaseUrl: "https://example.com",
    searchCompleted: true,
    url: {
      matched: true,
      candidateCount: 1,
      channel: {
        id: 88,
        name: "Managed Channel 88",
      },
    },
    key: {
      comparable: true,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
    },
    models: {
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
      channel: {
        id: 88,
        name: "Managed Channel 88",
      },
      similarityScore: 1,
    },
  }

  return {
    ...base,
    ...overrides,
    url: {
      ...base.url,
      ...overrides.url,
    },
    key: {
      ...base.key,
      ...overrides.key,
    },
    models: {
      ...base.models,
      ...overrides.models,
    },
  }
}

const getBadgeTooltip = (label: string) => {
  const element = screen.getByText(label)
  return element.closest("span[title]")
}

describe("TokenHeader save to API profiles", () => {
  beforeEach(() => {
    mockCreateProfile.mockReset()
    mockOpenApiCredentialProfilesPage.mockReset()
    mockOpenManagedSiteChannelsForChannel.mockReset()
    mockOpenManagedSiteChannelsPage.mockReset()
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
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
          assessment: createManagedSiteAssessment(),
        }}
      />,
    )

    expect(
      screen.getByText("keyManagement:managedSiteStatus.badges.unknown"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.secondaryExactModelsMatch",
      ),
    ).toBeNull()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.signals.url.matched"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.signals.key.noMatch"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.signals.models.exact"),
    ).toBeInTheDocument()
    expect(
      getBadgeTooltip("keyManagement:managedSiteStatus.signals.key.noMatch"),
    )?.toHaveAttribute("title")
    expect(
      getBadgeTooltip(
        "keyManagement:managedSiteStatus.signals.key.noMatch",
      )?.getAttribute("title"),
    ).toContain("keyManagement:managedSiteStatus.signals.key.tooltipNoMatch")
    const button = screen.getByRole("button", {
      name: `${testI18n.t("managedSiteModelSync:actions.manageChannel")}: keyManagement:managedSiteStatus.actions.reviewChannels`,
    })
    expect(button).toHaveTextContent(
      "keyManagement:managedSiteStatus.actions.reviewChannels",
    )

    await userEvent.setup().click(button)

    expect(mockOpenManagedSiteChannelsPage).toHaveBeenCalledWith({
      search: "https://example.com",
    })
  })

  it("suppresses managed-site status badges and review links when Veloera is selected", () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "Veloera",
      claudeCodeRouterBaseUrl: "",
      claudeCodeRouterApiKey: "",
      cliProxyBaseUrl: "",
      cliProxyManagementKey: "",
    })

    const account = createAccountStub()
    const token = {
      id: 2,
      user_id: 1,
      key: "sk-veloera",
      status: 1,
      name: "Veloera Token",
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
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
          assessment: createManagedSiteAssessment(),
        }}
      />,
    )

    expect(
      screen.queryByText("keyManagement:managedSiteStatus.badges.unknown"),
    ).toBeNull()
    expect(
      screen.queryByText("keyManagement:managedSiteStatus.signals.url.matched"),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: `${testI18n.t("managedSiteModelSync:actions.manageChannel")}: keyManagement:managedSiteStatus.actions.reviewChannels`,
      }),
    ).toBeNull()
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
          assessment: createManagedSiteAssessment({
            url: {
              matched: true,
              candidateCount: 1,
              channel: {
                id: 99,
                name: "Managed Channel 99",
              },
            },
            key: {
              comparable: true,
              matched: true,
              reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
              channel: {
                id: 99,
                name: "Managed Channel 99",
              },
            },
            models: {
              comparable: true,
              matched: true,
              reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
              channel: {
                id: 99,
                name: "Managed Channel 99",
              },
              similarityScore: 1,
            },
          }),
        }}
      />,
    )

    expect(
      screen.getByText("keyManagement:managedSiteStatus.badges.added"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.exactKeyMatch",
      ),
    ).toBeNull()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.signals.key.matched"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.signals.models.exact"),
    ).toBeInTheDocument()

    await userEvent.setup().click(
      screen.getByRole("button", {
        name: `${testI18n.t("managedSiteModelSync:actions.manageChannel")}: Managed Channel 99`,
      }),
    )

    expect(mockOpenManagedSiteChannelsForChannel).toHaveBeenCalledWith(99)
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
          assessment: createManagedSiteAssessment({
            url: {
              matched: false,
              candidateCount: 0,
            },
            key: {
              comparable: false,
              matched: false,
              reason:
                MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
            },
            models: {
              comparable: false,
              matched: false,
              reason:
                MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE,
            },
          }),
        }}
      />,
    )

    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.exactVerificationUnavailable",
      ),
    ).toBeNull()
    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.newApiRetrieveKeyHint",
      ),
    ).toBeNull()
    expect(
      screen.getByText(
        "keyManagement:managedSiteStatus.signals.key.unavailable",
      ),
    ).toBeInTheDocument()
    expect(
      getBadgeTooltip(
        "keyManagement:managedSiteStatus.signals.key.unavailable",
      ),
    )?.toHaveAttribute("title")
    expect(
      getBadgeTooltip(
        "keyManagement:managedSiteStatus.signals.key.unavailable",
      )?.getAttribute("title"),
    ).toContain(
      "keyManagement:managedSiteStatus.signals.key.tooltipUnavailable",
    )
    expect(
      getBadgeTooltip(
        "keyManagement:managedSiteStatus.signals.key.unavailable",
      )?.getAttribute("title"),
    ).toContain(
      "keyManagement:managedSiteStatus.descriptions.newApiRetrieveKeyHint",
    )
  })

  it("renders fuzzy and similarity explanations for non-exact managed-site matches", () => {
    const account = createAccountStub()

    const fuzzyToken = {
      id: 6,
      user_id: 1,
      key: "sk-fuzzy",
      status: 1,
      name: "Fuzzy Token",
      created_time: 0,
      accessed_time: 0,
      expired_time: 0,
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 0,
      accountId: account.id,
      accountName: account.name,
    }

    const { rerender } = render(
      <TokenHeader
        token={fuzzyToken as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
        managedSiteStatus={{
          status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
          reason:
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
          assessment: createManagedSiteAssessment({
            url: {
              matched: true,
              candidateCount: 1,
              channel: {
                id: 77,
                name: "Managed Channel 77",
              },
            },
            key: {
              comparable: true,
              matched: false,
              reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
            },
            models: {
              comparable: true,
              matched: false,
              reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
            },
          }),
        }}
      />,
    )

    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.fuzzyUrlOnlyMatch",
      ),
    ).toBeNull()
    expect(
      screen.getByText(
        "keyManagement:managedSiteStatus.signals.models.noMatch",
      ),
    ).toBeInTheDocument()

    rerender(
      <TokenHeader
        token={fuzzyToken as any}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={account}
        managedSiteStatus={{
          status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
          reason:
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
          assessment: createManagedSiteAssessment({
            url: {
              matched: true,
              candidateCount: 1,
              channel: {
                id: 78,
                name: "Managed Channel 78",
              },
            },
            key: {
              comparable: false,
              matched: false,
              reason:
                MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
            },
            models: {
              comparable: true,
              matched: true,
              reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR,
              channel: {
                id: 78,
                name: "Managed Channel 78",
              },
              similarityScore: 0.5,
            },
          }),
        }}
      />,
    )

    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.secondaryModelsSimilarMatch",
      ),
    ).toBeNull()
    expect(
      screen.getByText(
        "keyManagement:managedSiteStatus.signals.models.similar",
      ),
    ).toBeInTheDocument()
  })

  it("renders separate key and model badges when key matches but models do not", () => {
    const account = createAccountStub()
    const token = {
      id: 7,
      user_id: 1,
      key: "sk-key-only",
      status: 1,
      name: "Key Only Token",
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
            MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
          assessment: createManagedSiteAssessment({
            key: {
              comparable: true,
              matched: true,
              reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
              channel: {
                id: 91,
                name: "Managed Channel 91",
              },
            },
            models: {
              comparable: true,
              matched: false,
              reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
            },
          }),
        }}
      />,
    )

    expect(
      screen.queryByText(
        "keyManagement:managedSiteStatus.descriptions.keyMatchedModelsMismatch",
      ),
    ).toBeNull()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.signals.key.matched"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:managedSiteStatus.signals.models.noMatch",
      ),
    ).toBeInTheDocument()
    expect(
      getBadgeTooltip("keyManagement:managedSiteStatus.signals.key.matched"),
    )?.toHaveAttribute("title")
    expect(
      getBadgeTooltip(
        "keyManagement:managedSiteStatus.signals.key.matched",
      )?.getAttribute("title"),
    ).toContain("keyManagement:managedSiteStatus.signals.key.tooltipMatched")
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
