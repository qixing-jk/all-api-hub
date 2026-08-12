import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ApiCredentialProfiles from "~/entrypoints/options/pages/ApiCredentialProfiles"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import {
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/services/verification/webAiApiCheck/extractCredentials"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { requireHistoryTarget } from "~~/tests/test-utils/history"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

let store: ApiCredentialProfile[] = []
const mockOpenModelsPage = vi.fn()
const mockOpenSettingsTab = vi.fn()
const mockOpenWithCredentials = vi.fn()
const pushWithinOptionsPageMock = vi.fn()
const mockUseUserPreferencesContext = vi.fn()
const mockDismissGatewayGuidanceSurface = vi.fn()
const mockFetchOpenAICompatibleModelIds = vi.fn(
  async (
    _params: Parameters<
      typeof import("~/services/aiApi/openaiCompatible").fetchOpenAICompatibleModelIds
    >[0],
  ): Promise<string[]> => [],
)

const mockListProfiles = vi.fn(async () => store)
const mockFetchApiCredentialModelIds = vi.fn(
  async (
    _params: Parameters<
      typeof import("~/services/apiCredentialProfiles/modelCatalog").fetchApiCredentialModelIds
    >[0],
  ): Promise<string[]> => [],
)
const mockListTags = vi.fn(async (): Promise<Tag[]> => [])
const mockCreateTag = vi.fn(async (name: string) => ({
  id: `t-${name}`,
  name,
  createdAt: 0,
  updatedAt: 0,
}))
const mockRenameTag = vi.fn(async (tagId: string, name: string) => ({
  id: tagId,
  name,
  createdAt: 0,
  updatedAt: 0,
}))
const mockDeleteTag = vi.fn(async (tagId: string) => {
  void tagId
  return { updatedAccounts: 0 }
})
const mockCreateProfile = vi.fn(
  async (input: {
    name: string
    apiType: string
    baseUrl: string
    apiKey: string
    tagIds?: string[]
    notes?: string
  }) => {
    const normalizedBaseUrl =
      input.apiType === API_TYPES.GOOGLE
        ? normalizeGoogleFamilyBaseUrl(input.baseUrl) ?? input.baseUrl
        : normalizeOpenAiFamilyBaseUrl(input.baseUrl) ?? input.baseUrl

    const now = Date.now()
    const profile: ApiCredentialProfile = {
      id: `p-${store.length + 1}`,
      name: input.name,
      apiType: input.apiType as any,
      baseUrl: normalizedBaseUrl,
      apiKey: input.apiKey,
      tagIds: input.tagIds ?? [],
      notes: input.notes ?? "",
      createdAt: now,
      updatedAt: now,
    }

    store = [...store, profile]
    return profile
  },
)

const mockUpdateProfile = vi.fn(
  async (id: string, updates: Partial<ApiCredentialProfile>) => {
    const next = store.map((p) => (p.id === id ? { ...p, ...updates } : p))
    store = next
    const updated = next.find((p) => p.id === id)
    if (!updated) throw new Error("not found")
    return updated
  },
)

const mockDeleteProfile = vi.fn(async (id: string) => {
  const before = store.length
  store = store.filter((p) => p.id !== id)
  return store.length !== before
})

type UserPreferencesContextValue = ReturnType<typeof useUserPreferencesContext>
type ApiCredentialProfilesContextValue = Pick<
  UserPreferencesContextValue,
  | "preferences"
  | "managedSiteType"
  | "currencyType"
  | "claudeCodeRouterBaseUrl"
  | "claudeCodeRouterApiKey"
  | "cliProxyBaseUrl"
  | "cliProxyManagementKey"
  | "dismissGatewayGuidanceSurface"
>

const createManagedSitePreferences = (
  newApiOverrides: Partial<UserPreferences["newApi"]> = {},
): UserPreferences => ({
  ...DEFAULT_PREFERENCES,
  managedSiteType: SITE_TYPES.NEW_API,
  newApi: {
    ...DEFAULT_PREFERENCES.newApi,
    baseUrl: "https://managed.example",
    adminToken: "managed-token",
    userId: "1",
    ...newApiOverrides,
  },
})

const createApiCredentialProfilesContextValue = (
  preferences: UserPreferences = createManagedSitePreferences(),
) =>
  ({
    preferences,
    managedSiteType: preferences.managedSiteType,
    currencyType: preferences.currencyType,
    claudeCodeRouterBaseUrl: preferences.claudeCodeRouter?.baseUrl ?? "",
    claudeCodeRouterApiKey: preferences.claudeCodeRouter?.apiKey ?? "",
    cliProxyBaseUrl: preferences.cliProxy?.baseUrl ?? "",
    cliProxyManagementKey: preferences.cliProxy?.managementKey ?? "",
    dismissGatewayGuidanceSurface: mockDismissGatewayGuidanceSurface,
  }) satisfies ApiCredentialProfilesContextValue

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    subscribeToApiCredentialProfilesChanges: () => () => {},
    apiCredentialProfilesStorage: {
      listProfiles: () => mockListProfiles(),
      createProfile: (input: any) => mockCreateProfile(input),
      updateProfile: (id: string, updates: Partial<ApiCredentialProfile>) =>
        mockUpdateProfile(id, updates),
      deleteProfile: (id: string) => mockDeleteProfile(id),
    },
  }),
)

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({ openWithCredentials: mockOpenWithCredentials }),
}))

vi.mock("~/services/apiCredentialProfiles/modelCatalog", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/apiCredentialProfiles/modelCatalog")
  >("~/services/apiCredentialProfiles/modelCatalog")

  return {
    ...actual,
    fetchApiCredentialModelIds: (
      params: Parameters<
        typeof import("~/services/apiCredentialProfiles/modelCatalog").fetchApiCredentialModelIds
      >[0],
    ) => mockFetchApiCredentialModelIds(params),
  }
})

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    listTags: () => mockListTags(),
    createTag: (name: string) => mockCreateTag(name),
    renameTag: (tagId: string, name: string) => mockRenameTag(tagId, name),
    deleteTag: (tagId: string) => mockDeleteTag(tagId),
  },
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => mockUseUserPreferencesContext(),
  }
})

vi.mock("~/utils/navigation", () => ({
  openModelsPage: (...args: unknown[]) => mockOpenModelsPage(...args),
  openSettingsTab: (...args: unknown[]) => mockOpenSettingsTab(...args),
  pushWithinOptionsPage: (...args: unknown[]) =>
    pushWithinOptionsPageMock(...args),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (
    params: Parameters<
      typeof import("~/services/aiApi/openaiCompatible").fetchOpenAICompatibleModelIds
    >[0],
  ) => mockFetchOpenAICompatibleModelIds(params),
}))

describe("ApiCredentialProfiles page", () => {
  beforeEach(async () => {
    globalThis.sessionStorage?.clear()
    store = []
    mockListProfiles.mockClear()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])
    mockFetchApiCredentialModelIds.mockReset()
    mockFetchApiCredentialModelIds.mockResolvedValue([])
    mockCreateProfile.mockClear()
    mockUpdateProfile.mockClear()
    mockDeleteProfile.mockClear()
    mockListTags.mockClear()
    mockCreateTag.mockClear()
    mockRenameTag.mockClear()
    mockDeleteTag.mockClear()
    mockOpenModelsPage.mockReset()
    mockOpenSettingsTab.mockReset()
    mockOpenWithCredentials.mockReset()
    pushWithinOptionsPageMock.mockReset()
    mockDismissGatewayGuidanceSurface.mockReset()
    mockUseUserPreferencesContext.mockReturnValue(
      createApiCredentialProfilesContextValue(),
    )
    await verificationResultHistoryStorage.clearAllData()
  })

  it("guides users to save an API credential before gateway import", async () => {
    const user = userEvent.setup()

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:unifiedApiGuidance.title"),
    ).toBeVisible()
    expect(
      screen.getByText(
        "apiCredentialProfiles:unifiedApiGuidance.description.needs_sources",
      ),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.addApiCredential",
      }),
    )

    expect(
      await screen.findByText("apiCredentialProfiles:dialog.addTitle"),
    ).toBeInTheDocument()
  })

  it("guides saved API credentials to managed-site setup when the gateway is incomplete", async () => {
    const user = userEvent.setup()
    store = [
      {
        id: "p-1",
        name: "Saved Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.invalid",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    mockUseUserPreferencesContext.mockReturnValue(
      createApiCredentialProfilesContextValue(
        createManagedSitePreferences({ adminToken: "", userId: "" }),
      ),
    )

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText(
        "apiCredentialProfiles:unifiedApiGuidance.description.needs_managed_site",
      ),
    ).toBeVisible()
    expect(await screen.findByText("Saved Key")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.configureManagedSite",
      }),
    )

    expect(mockOpenSettingsTab).toHaveBeenCalledWith("managedSite", {
      preserveHistory: true,
    })
  })

  it("keeps ready API credential gateway guidance on the credential workflow", async () => {
    const user = userEvent.setup()
    store = [
      {
        id: "p-1",
        name: "Ready Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.invalid",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText(
        "apiCredentialProfiles:unifiedApiGuidance.description.ready_to_import",
      ),
    ).toBeVisible()
    expect(await screen.findByText("Ready Key")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "account:unifiedApiGuidance.actions.addAccount",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.addFirstChannel",
      }),
    )

    expect(pushWithinOptionsPageMock).not.toHaveBeenCalled()
    expect(mockOpenWithCredentials).not.toHaveBeenCalled()
    const importMenuItem = await screen.findByRole("menuitem", {
      name: "keyManagement:actions.importToManagedSite",
    })
    expect(importMenuItem).toBeVisible()
    expect(importMenuItem).toHaveAttribute("data-guidance-highlight", "true")
  })

  it("reveals the managed-site import entry from a guided deep link", async () => {
    store = [
      {
        id: "p-1",
        name: "Deep-linked Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.invalid",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(
      <ApiCredentialProfiles
        routeParams={{
          [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
            KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
        }}
      />,
    )

    const importMenuItem = await screen.findByRole("menuitem", {
      name: "keyManagement:actions.importToManagedSite",
    })
    expect(importMenuItem).toBeVisible()
    expect(importMenuItem).toHaveAttribute("data-guidance-highlight", "true")
    expect(mockOpenWithCredentials).not.toHaveBeenCalled()
  })

  it("keeps managed-site setup recovery out of guidance for complete configuration", async () => {
    store = [
      {
        id: "p-1",
        name: "Complete Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.invalid",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText(
        "apiCredentialProfiles:unifiedApiGuidance.description.ready_to_import",
      ),
    ).toBeVisible()
    expect(
      screen.queryByText(
        "apiCredentialProfiles:unifiedApiGuidance.description.needs_managed_site",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.configureManagedSite",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialProfiles:unifiedApiGuidance.importHint"),
    ).toBeVisible()
  })

  it("hides API credential gateway guidance after gateway onboarding has completed once", async () => {
    mockUseUserPreferencesContext.mockReturnValue(
      createApiCredentialProfilesContextValue({
        ...createManagedSitePreferences(),
        gatewayGuidance: {
          onboardingCompletedAt: 1,
        },
      }),
    )

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("apiCredentialProfiles:unifiedApiGuidance.title"),
    ).not.toBeInTheDocument()
  })

  it("temporarily hides API credential gateway guidance without writing preferences", async () => {
    const user = userEvent.setup()

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:unifiedApiGuidance.title"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.dismissForSession",
      }),
    )

    expect(
      screen.queryByText("apiCredentialProfiles:unifiedApiGuidance.title"),
    ).not.toBeInTheDocument()
    expect(mockDismissGatewayGuidanceSurface).not.toHaveBeenCalled()
  })

  it("permanently dismisses API credential gateway guidance for the API credential surface", async () => {
    const user = userEvent.setup()
    mockDismissGatewayGuidanceSurface.mockResolvedValueOnce({
      ok: true,
      preferences: {
        ...DEFAULT_PREFERENCES,
        gatewayGuidance: {
          dismissedAtBySurface: {
            apiCredentialProfiles: 1,
          },
        },
      },
    })

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:unifiedApiGuidance.title"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.permanentlyDismiss",
      }),
    )

    expect(
      screen.getByRole("dialog", {
        name: "apiCredentialProfiles:unifiedApiGuidance.dismissDialog.title",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.dismissDialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(mockDismissGatewayGuidanceSurface).toHaveBeenCalledWith(
        "apiCredentialProfiles",
      )
    })
  })

  it("shows a safe local error when permanent dismissal rejects", async () => {
    const user = userEvent.setup()
    mockDismissGatewayGuidanceSurface.mockRejectedValueOnce(
      new Error("sensitive backend detail"),
    )

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:unifiedApiGuidance.title"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.permanentlyDismiss",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.dismissDialog.confirm",
      }),
    )

    expect(
      await screen.findByRole("alert", {
        name: "messages:toast.error.saveFailed",
      }),
    ).toBeVisible()
    expect(
      screen.queryByText("sensitive backend detail"),
    ).not.toBeInTheDocument()
  })

  it("creates a profile via the add dialog and renders it", async () => {
    const user = userEvent.setup()

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:empty.title"),
    ).toBeInTheDocument()

    const addButtons = screen.getAllByRole("button", {
      name: "apiCredentialProfiles:actions.add",
    })
    await user.click(addButtons[0]!)

    expect(
      await screen.findByText("apiCredentialProfiles:dialog.addTitle"),
    ).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText(
      "apiCredentialProfiles:dialog.placeholders.name",
    )
    const baseUrlInput = screen.getByPlaceholderText(
      "apiCredentialProfiles:dialog.placeholders.baseUrl",
    )
    const apiKeyInput = screen.getByPlaceholderText(
      "apiCredentialProfiles:dialog.placeholders.apiKey",
    )

    await user.click(nameInput)
    await user.paste("My Profile")
    await user.click(baseUrlInput)
    await user.paste("https://example.com/v1/models")
    await user.click(apiKeyInput)
    await user.paste("sk-test")

    await user.click(
      screen.getByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText("My Profile")).toBeInTheDocument()
    expect(await screen.findByText("https://example.com")).toBeInTheDocument()
  })

  it("opens a prefilled add dialog from sponsor route params", async () => {
    render(
      <ApiCredentialProfiles
        routeParams={{
          action: "add",
          name: "Manual Provider",
          baseUrl: "https://manual.example.com",
          apiKeyCreateUrl: "https://manual.example.com/keys?aff=all-api-hub",
          apiKeyCreateHint: "Use promo code APIHUB after registration.",
        }}
      />,
    )

    expect(
      await screen.findByText("apiCredentialProfiles:dialog.addTitle"),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue("Manual Provider")).toBeInTheDocument()
    expect(
      screen.getByDisplayValue("https://manual.example.com"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: "apiCredentialProfiles:dialog.actions.openApiKeyCreateUrl",
      }),
    ).toHaveAttribute("href", "https://manual.example.com/keys?aff=all-api-hub")
    expect(
      screen.getByText("Use promo code APIHUB after registration."),
    ).toBeInTheDocument()
  })

  it("edits an existing profile", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "Original",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("Original")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.edit" }),
    )

    expect(
      await screen.findByText("apiCredentialProfiles:dialog.editTitle"),
    ).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText(
      "apiCredentialProfiles:dialog.placeholders.name",
    )
    await user.clear(nameInput)
    await user.click(nameInput)
    await user.paste("Updated")

    await user.click(
      screen.getByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText("Updated")).toBeInTheDocument()
  })

  it("deletes a profile via confirmation dialog", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "To Delete",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("To Delete")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.delete" }),
    )

    expect(
      await screen.findByText("apiCredentialProfiles:delete.title"),
    ).toBeInTheDocument()

    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: "common:actions.delete" }),
    )

    await waitFor(() => {
      expect(mockDeleteProfile).toHaveBeenCalledTimes(1)
    })

    expect(
      await screen.findByText("apiCredentialProfiles:empty.title"),
    ).toBeInTheDocument()
  })

  it("filters profiles by search and apiType", async () => {
    const user = userEvent.setup()

    mockListTags.mockResolvedValue([
      { id: "t-prod", name: "prod", createdAt: 1, updatedAt: 1 },
      { id: "t-dev", name: "dev", createdAt: 1, updatedAt: 1 },
    ])

    store = [
      {
        id: "p-1",
        name: "OpenAI",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://openai.example.com",
        apiKey: "sk-openai",
        tagIds: ["t-prod"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "p-2",
        name: "Google",
        apiType: API_TYPES.GOOGLE,
        baseUrl: "https://google.example.com",
        apiKey: "AIza-test",
        tagIds: ["t-dev"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByRole("heading", { name: "OpenAI" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("combobox", {
        name: "apiCredentialProfiles:grouping.baseUrlSelector",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Google" }),
    ).not.toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(
      "apiCredentialProfiles:controls.searchPlaceholder",
    )
    await user.click(searchInput)
    await user.paste("goog")

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "OpenAI" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("heading", { name: "Google" }),
      ).toBeInTheDocument()
    })

    await user.clear(searchInput)

    const filter = screen.getAllByRole("combobox")[0]!
    await user.click(filter)
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.google",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "OpenAI" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("heading", { name: "Google" }),
      ).toBeInTheDocument()
    })
  })

  it("opens export dialogs from the per-profile export menu", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "Exportable",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("Exportable")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )

    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.exportToCCSwitch",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.ccswitch.description"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )

    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.exportToKiloCode",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.kiloCode.title"),
    ).toBeInTheDocument()
  })

  it("opens shared CLI verification for a stored profile", async () => {
    const user = userEvent.setup()
    mockFetchApiCredentialModelIds.mockResolvedValueOnce(["gpt-4o-mini"])

    store = [
      {
        id: "p-1",
        name: "CLI Profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("CLI Profile")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyApi",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyCliSupport",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.verifyCliSupport",
      }),
    )

    expect(
      await screen.findByText("cliSupportVerification:verifyDialog.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("combobox", {
        name: "cliSupportVerification:verifyDialog.meta.model",
      }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("combobox", {
        name: "cliSupportVerification:verifyDialog.meta.model",
      }),
    )
    expect(
      await screen.findByRole("option", { name: "gpt-4o-mini" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("cliSupportVerification:verifyDialog.meta.runtimeKey"),
    ).not.toBeInTheDocument()
  })

  it("opens Model Management for a stored profile without exposing credentials", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "Model Profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-secret",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("Model Profile")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:actions.openModelManagement",
      }),
    )

    expect(mockOpenModelsPage).toHaveBeenCalledWith({ profileId: "p-1" })
    expect(mockOpenModelsPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-secret" }),
    )
  })

  it("filters profiles by tags", async () => {
    const user = userEvent.setup()

    mockListTags.mockResolvedValue([
      { id: "t-prod", name: "prod", createdAt: 1, updatedAt: 1 },
      { id: "t-dev", name: "dev", createdAt: 1, updatedAt: 1 },
    ])

    store = [
      {
        id: "p-1",
        name: "OpenAI",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://openai.example.com",
        apiKey: "sk-openai",
        tagIds: ["t-prod"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "p-2",
        name: "Google",
        apiType: API_TYPES.GOOGLE,
        baseUrl: "https://google.example.com",
        apiKey: "AIza-test",
        tagIds: ["t-dev"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByRole("heading", { name: "OpenAI" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("combobox", {
        name: "apiCredentialProfiles:grouping.baseUrlSelector",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Google" }),
    ).not.toBeInTheDocument()

    await user.click(await screen.findByRole("button", { name: /prod/i }))

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("heading", { name: "Google" }),
      ).not.toBeInTheDocument()
    })
  })
  it("shows persisted verification status in the profile list", async () => {
    store = [
      {
        id: "p-1",
        name: "History Profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("p-1"),
    )

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 6,
          summary: "Stored list history",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    render(<ApiCredentialProfiles />)

    const profileName = await screen.findByText("History Profile")
    const profileCard = profileName.closest<HTMLElement>(
      "div.rounded-lg.border",
    )

    expect(profileName).toBeInTheDocument()
    expect(profileCard).not.toBeNull()
    expect(
      within(profileCard!).getAllByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ).length,
    ).toBeGreaterThan(0)
    await waitFor(() => {
      expect(
        Array.from(profileCard!.querySelectorAll('[data-slot="badge"]')).some(
          (badge) =>
            badge.textContent?.includes(
              "aiApiVerification:verifyDialog.status.pass",
            ) ?? false,
        ),
      ).toBe(true)
    })
  })
})
