import type { ReactNode } from "react"
import { vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"

const mocks = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  resolveApiTokenKeyMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  kelivoExportDialogMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  createApiCredentialProfileMock: vi.fn(),
  captureApiCredentialProfileMock: vi.fn(),
  fetchServiceCredentialMock: vi.fn(),
  ccSwitchDialogMock: vi.fn(),
  cliProxyApiDialogMock: vi.fn(),
  claudeCodeRouterDialogMock: vi.fn(),
  kiloCodeExportDialogMock: vi.fn(),
  kiloCodeProfileExportDialogMock: vi.fn(),
  cursorPlusExportDialogMock: vi.fn(),
  openWithCredentialsMock: vi.fn(),
  openAccountKeyResourcesMock: vi.fn(),
  resolveDefaultAccountKeyScopeMock: vi.fn(),
  openAccountKeyCollectionMock: vi.fn(),
  listAccountKeyResourcesMock: vi.fn(),
  openKeysPageMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  userPreferencesContextMock: {
    claudeCodeRouterApiKey: "ccr-management-key",
    claudeCodeRouterBaseUrl: "https://router.example.invalid",
    cliProxyApiBaseUrl: "https://cliproxy.example.invalid",
    cliProxyApiManagementKey: "cliproxy-management-key",
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
    // vi.hoisted runs before imported constants are initialized.
    managedSiteType: "new-api",
    themeMode: "system",
    updateThemeMode: vi.fn(),
  },
}))

export const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  resolveApiTokenKeyMock,
  openInCherryStudioMock,
  kelivoExportDialogMock,
  openWithAccountMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  toastSuccessMock,
  toastErrorMock,
  createApiCredentialProfileMock,
  captureApiCredentialProfileMock,
  fetchServiceCredentialMock,
  ccSwitchDialogMock,
  cliProxyApiDialogMock,
  claudeCodeRouterDialogMock,
  kiloCodeExportDialogMock,
  kiloCodeProfileExportDialogMock,
  cursorPlusExportDialogMock,
  openWithCredentialsMock,
  openAccountKeyResourcesMock,
  resolveDefaultAccountKeyScopeMock,
  openAccountKeyCollectionMock,
  listAccountKeyResourcesMock,
  openKeysPageMock,
  loggerErrorMock,
  userPreferencesContextMock,
} = mocks

vi.mock("~/lib/notify", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: (siteType: string) => ({
    account:
      siteType === SITE_TYPES.SHAREDCHAT
        ? {
            serviceCredential: {
              fetch: (...args: any[]) => fetchServiceCredentialMock(...args),
            },
          }
        : {
            keyResourceManagement: {
              defaultCreation: "editor-defaults",
              inventorySecretAvailability: [
                SITE_TYPES.AIHUBMIX,
                SITE_TYPES.OPENROUTER,
              ].includes(siteType as any)
                ? "create-response-only"
                : "recoverable",
              open: (...args: any[]) => openAccountKeyResourcesMock(...args),
            },
          },
  }),
}))

const inventoryFixtures = new Map<string, any[]>()
vi.mock(
  "~/services/accounts/accountKeyResourceInventory",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/accountKeyResourceInventory")
      >()
    const { buildNewApiKeyFacts } = await import(
      "~~/tests/test-utils/accountKeyFixtures"
    )
    return {
      ...actual,
      fetchDisplayAccountKeyResourceInventory: async (
        account: any,
        options: any,
      ) => {
        if (account.siteType === SITE_TYPES.OPENROUTER)
          return actual.fetchDisplayAccountKeyResourceInventory(
            account,
            options,
          )
        const tokens = await fetchAccountTokensMock(account)
        if (!Array.isArray(tokens))
          throw new Error("Native inventory unavailable")
        inventoryFixtures.set(account.id, tokens)
        return {
          scope: {
            scopeKey: "account",
            routeKey: "account",
            displayName: "Account",
            isDefault: true,
          },
          items: tokens.map((token) => buildNewApiKeyFacts(account, token)),
        }
      },
    }
  },
)
vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    const { formatAccountRuntimeKeySecretForSite } = await import(
      "~/services/accounts/accountRuntimeKeys"
    )
    return {
      ...actual,
      resolveDisplayAccountRuntimeKeySecret: async (
        account: any,
        runtimeKey: any,
        options: any,
      ) => {
        if (
          runtimeKey.source === "service_credential" ||
          account.siteType === SITE_TYPES.OPENROUTER
        )
          return actual.resolveDisplayAccountRuntimeKeySecret(
            account,
            runtimeKey,
            options,
          )
        const token = inventoryFixtures
          .get(account.id)
          ?.find(
            (item) => String(item.id) === runtimeKey.resourceRef.resourceId,
          )
        const secret = await resolveApiTokenKeyMock({
          request: actual.createDisplayAccountApiContext(account).request,
          token: token ?? {
            id: runtimeKey.legacyTokenId,
            key: runtimeKey.secret,
          },
        })
        return formatAccountRuntimeKeySecretForSite({ ...runtimeKey, secret })
      },
    }
  },
)

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openKeysPage: (...args: unknown[]) => openKeysPageMock(...args),
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerErrorMock,
  }),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: openWithAccountMock,
    openWithCredentials: openWithCredentialsMock,
  }),
}))

vi.mock("~/components/CCSwitchExportDialog", () => ({
  CCSwitchExportDialog: (props: unknown) => {
    ccSwitchDialogMock(props)
    return null
  },
}))

vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: (props: unknown) => {
    claudeCodeRouterDialogMock(props)
    return null
  },
}))

vi.mock("~/components/CliProxyApiExportDialog", () => ({
  CliProxyApiExportDialog: (props: unknown) => {
    cliProxyApiDialogMock(props)
    return null
  },
}))

vi.mock("~/components/KiloCodeExportDialog", () => ({
  KiloCodeExportDialog: (props: unknown) => {
    kiloCodeExportDialogMock(props)
    return null
  },
}))

vi.mock("~/components/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: (props: unknown) => {
    cursorPlusExportDialogMock(props)
    const { isOpen, onClose } = props as {
      isOpen: boolean
      onClose: () => void
    }
    return isOpen ? (
      <button type="button" onClick={onClose}>
        close Cursor++ export
      </button>
    ) : null
  },
}))

vi.mock("~/components/KelivoExportDialog", () => ({
  KelivoExportDialog: (props: unknown) => {
    kelivoExportDialogMock(props)
    const { isOpen, onClose } = props as {
      isOpen: boolean
      onClose: () => void
    }
    return isOpen ? (
      <button type="button" onClick={onClose}>
        close Kelivo export
      </button>
    ) : null
  },
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog",
  () => ({
    KiloCodeProfileExportDialog: (props: unknown) => {
      kiloCodeProfileExportDialogMock(props)
      return null
    },
  }),
)

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: () => userPreferencesContextMock,
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  FeatureGuidanceProvider: ({ children }: { children: ReactNode }) => children,
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted:
      userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted,
  }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: (...args: unknown[]) => openInCherryStudioMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    startProductAnalyticsAction: (...args: unknown[]) =>
      startProductAnalyticsActionMock(...args),
  }
})

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: {
    capture: async (input: { profile: unknown }) => {
      captureApiCredentialProfileMock(input)
      return {
        status: "captured",
        profile: await createApiCredentialProfileMock(input.profile),
      }
    },
  },
}))
