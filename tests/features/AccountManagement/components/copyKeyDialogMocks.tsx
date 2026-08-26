import type { ReactNode } from "react"
import { vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"

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
  cliProxyDialogMock: vi.fn(),
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
  userPreferencesContextMock: {
    claudeCodeRouterApiKey: "ccr-management-key",
    claudeCodeRouterBaseUrl: "https://router.example.invalid",
    cliProxyBaseUrl: "https://cliproxy.example.invalid",
    cliProxyManagementKey: "cliproxy-management-key",
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
  cliProxyDialogMock,
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
  userPreferencesContextMock,
} = mocks

const normalizeGroupNames = (groups: Record<string, unknown>): string[] =>
  Array.from(
    new Set(
      Object.keys(groups)
        .map((group) => group.trim())
        .filter(Boolean),
    ),
  )

const createSub2ApiTokenProvisioningMock = () => ({
  isInventoryTokenUsable: vi.fn(() => true),
  resolveDefaultTokenCreation: vi.fn((request: any) => {
    const explicitGroup =
      typeof request.explicitGroup === "string"
        ? request.explicitGroup.trim()
        : ""

    if (explicitGroup) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...request.defaultTokenData, group: explicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    if (
      request.workflow !== TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection &&
      request.workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation
    ) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
      }
    }

    if (!request.userGroups) {
      return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
    }

    const allowedGroups = normalizeGroupNames(request.userGroups)

    if (allowedGroups.length === 0) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      }
    }

    if (allowedGroups.length === 1) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...request.defaultTokenData, group: allowedGroups[0] },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    }
  }),
  classifyCreatedToken: vi.fn(({ result }: any) =>
    result
      ? { kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch }
      : {
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
          reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
        },
  ),
})

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: (siteType: string) => {
    if (siteType === SITE_TYPES.OPENROUTER) {
      const keyResources = {
        open: (...args: any[]) => openAccountKeyResourcesMock(...args),
      }
      return {
        account: {
          keyResourceManagement: keyResources,
          keyResources,
        },
      }
    }

    if (siteType === SITE_TYPES.SHAREDCHAT) {
      return {
        account: {
          serviceCredential: {
            fetch: (...args: any[]) => fetchServiceCredentialMock(...args),
          },
        },
      }
    }

    return {
      account: {
        keyManagement: {
          fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
          createToken: (...args: any[]) => createApiTokenMock(...args),
          resolveTokenKey: (...args: any[]) => resolveApiTokenKeyMock(...args),
          deleteToken: vi.fn(),
          fetchAvailableModels: (...args: any[]) =>
            fetchAccountAvailableModelsMock(...args),
          userGroups: {
            fetch: (...args: any[]) => fetchUserGroupsMock(...args),
          },
          inventorySecretAvailability:
            siteType === SITE_TYPES.AIHUBMIX
              ? INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly
              : INVENTORY_SECRET_AVAILABILITIES.Recoverable,
        },
        tokenProvisioning: createSub2ApiTokenProvisioningMock(),
      },
    }
  },
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openKeysPage: (...args: unknown[]) => openKeysPageMock(...args),
  }
})

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

vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: (props: unknown) => {
    cliProxyDialogMock(props)
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
