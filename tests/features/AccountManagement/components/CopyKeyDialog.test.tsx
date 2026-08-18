import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { DialogFooter } from "~/features/AccountManagement/components/CopyKeyDialog/DialogFooter"
import { KeyInventoryList } from "~/features/AccountManagement/components/CopyKeyDialog/KeyInventoryList"
import { QuickKeyResourceCard } from "~/features/AccountManagement/components/CopyKeyDialog/QuickKeyResourceCard"
import { RuntimeKeyActionControls } from "~/features/AccountManagement/components/CopyKeyDialog/RuntimeKeyActionControls"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { KeyResourceCardPresentation } from "~/features/KeyManagement/presentation/keyResourceCard"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import * as accountOperations from "~/services/accounts/accountOperations"
import {
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
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
} = vi.hoisted(() => ({
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
    managedSiteType: "new-api",
    themeMode: "system",
    updateThemeMode: vi.fn(),
  },
}))

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

const actualResolveDefaultTokenQuickCreateResolution =
  accountOperations.resolveDefaultTokenQuickCreateResolution

const resolveDefaultTokenQuickCreateResolutionSpy = vi.spyOn(
  accountOperations,
  "resolveDefaultTokenQuickCreateResolution",
)

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  tagIds: ["tag-a"],
} as any

const AIHUBMIX_ACCOUNT = {
  ...ACCOUNT,
  id: "aihubmix-1",
  name: "AIHubMix",
  siteType: SITE_TYPES.AIHUBMIX,
  baseUrl: "https://aihubmix.com",
}

const OPENROUTER_ACCOUNT = {
  ...ACCOUNT,
  id: "openrouter-account",
  name: "OpenRouter",
  siteType: SITE_TYPES.OPENROUTER,
  baseUrl: "https://openrouter.example.invalid",
}

const OPENROUTER_SCOPE = {
  scopeKey: "default-workspace",
  routeKey: "default-workspace",
  displayName: "Default workspace",
  isDefault: true,
}

const OPENROUTER_KEY_FACTS = {
  ref: {
    accountId: OPENROUTER_ACCOUNT.id,
    siteType: SITE_TYPES.OPENROUTER,
    scopeKey: OPENROUTER_SCOPE.scopeKey,
    resourceId: "key-example",
  },
  displayName: "Example native key",
  maskedLabel: "sk-or-v1-...example",
  status: "enabled" as const,
  fields: [],
  actions: { canUpdate: true, canDelete: true },
}

const TOKEN = {
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "default",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  allow_ips: "",
  model_limits_enabled: false,
  model_limits: "",
  group: "",
} as any

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

const SHAREDCHAT_SERVICE_CREDENTIAL = {
  kind: "singleton_service_key" as const,
  service: "codex" as const,
  label: "Codex service key",
  key: "sk-service-credential-secret",
  isAuthenticated: true,
  baseUrl: "https://api.example.invalid/v1",
}

const SHAREDCHAT_ACCOUNT = {
  ...ACCOUNT,
  id: "sharedchat-account",
  name: "SharedChat",
  siteType: SITE_TYPES.SHAREDCHAT,
  baseUrl: "https://sharedchat.example.invalid",
  authType: AuthTypeEnum.Cookie,
  token: "",
  cookieAuthSessionCookie: "session=example",
} as any

async function renderExpandedServiceCredentialDialog() {
  fetchServiceCredentialMock.mockResolvedValue(SHAREDCHAT_SERVICE_CREDENTIAL)

  const user = userEvent.setup()

  render(
    <CopyKeyDialog
      isOpen={true}
      onClose={() => {}}
      account={SHAREDCHAT_ACCOUNT}
    />,
  )

  await user.click(await screen.findByText("Codex service key"))

  return user
}

async function selectExportAction(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const directAction = screen.queryByRole("button", { name })
  if (directAction) {
    await user.click(directAction)
    return
  }

  const openItem = screen.queryByRole("menuitem", { name })
  if (openItem) {
    await user.click(openItem)
    return
  }

  const trigger = screen.getByRole("button", {
    name: "common:actions.export",
  })
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await user.click(trigger)
  }
  await user.click(screen.getByRole("menuitem", { name }))
}

describe("CopyKeyDialog", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    fetchServiceCredentialMock.mockReset()
    ccSwitchDialogMock.mockReset()
    cliProxyDialogMock.mockReset()
    claudeCodeRouterDialogMock.mockReset()
    kiloCodeExportDialogMock.mockReset()
    kiloCodeProfileExportDialogMock.mockReset()
    cursorPlusExportDialogMock.mockReset()
    openWithCredentialsMock.mockReset()
    openAccountKeyResourcesMock.mockReset()
    resolveDefaultAccountKeyScopeMock.mockReset()
    openAccountKeyCollectionMock.mockReset()
    listAccountKeyResourcesMock.mockReset()
    openKeysPageMock.mockReset()
    resolveApiTokenKeyMock.mockReset()
    openInCherryStudioMock.mockReset()
    kelivoExportDialogMock.mockReset()
    openWithAccountMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    createApiCredentialProfileMock.mockReset()
    captureApiCredentialProfileMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    resolveApiTokenKeyMock.mockImplementation(
      async ({ token }: { token: { key: string } }) => token.key,
    )
    resolveDefaultTokenQuickCreateResolutionSpy.mockReset()
    resolveDefaultTokenQuickCreateResolutionSpy.mockImplementation(
      async (account, options) => {
        if (account.siteType === SITE_TYPES.SUB2API) {
          return actualResolveDefaultTokenQuickCreateResolution(
            account,
            options,
          )
        }

        return {
          kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
          tokenData: generateDefaultTokenRequest(),
        }
      },
    )
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    openWithCredentialsMock.mockResolvedValue({ opened: true })
    resolveDefaultAccountKeyScopeMock.mockResolvedValue(OPENROUTER_SCOPE)
    listAccountKeyResourcesMock.mockResolvedValue({
      items: [OPENROUTER_KEY_FACTS],
    })
    openAccountKeyCollectionMock.mockResolvedValue({
      scope: OPENROUTER_SCOPE,
      list: (...args: unknown[]) => listAccountKeyResourcesMock(...args),
    })
    openAccountKeyResourcesMock.mockResolvedValue({
      resolveDefaultScope: (...args: unknown[]) =>
        resolveDefaultAccountKeyScopeMock(...args),
      openCollection: (...args: unknown[]) =>
        openAccountKeyCollectionMock(...args),
    })
    openKeysPageMock.mockResolvedValue(undefined)
    userPreferencesContextMock.claudeCodeRouterApiKey = "ccr-management-key"
    userPreferencesContextMock.claudeCodeRouterBaseUrl =
      "https://router.example.invalid"
    userPreferencesContextMock.cliProxyBaseUrl =
      "https://cliproxy.example.invalid"
    userPreferencesContextMock.cliProxyManagementKey = "cliproxy-management-key"
    userPreferencesContextMock.managedSiteType = SITE_TYPES.NEW_API
  })

  it("omits optional empty-state and footer actions when callbacks are unavailable", () => {
    render(
      <>
        <KeyInventoryList
          runtimeKeys={[]}
          expandedRuntimeKeys={new Set()}
          copiedRuntimeKeyId={null}
          onToggleRuntimeKey={() => {}}
          onCopyKey={() => {}}
          account={ACCOUNT}
          supportsApiTokenCreation
        />
        <DialogFooter keyCount={0} onClose={() => {}} />
      </>,
    )

    expect(screen.getByText("ui:dialog.copyKey.noKeys")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "account:actions.keyManagement" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeEnabled()
  })

  it("renders unknown quick-key status without duplicating its header fact", () => {
    const contextFact = {
      id: "workspace",
      label: "Workspace",
      value: "Example workspace",
    }
    const quickPresentation: KeyResourceCardPresentation = {
      id: "quick-key-example",
      title: "Example quick key",
      accountLabel: "Example account",
      status: "unknown",
      statusLabel: "Unknown",
      secretAvailability: "unavailable",
      contextFact,
      summaryFacts: [contextFact],
      detailFacts: [],
      actions: {
        copySecret: false,
        revealSecret: false,
        verifySecret: false,
        exportSecret: false,
        edit: false,
        delete: false,
        batchSelect: false,
      },
    }

    render(
      <QuickKeyResourceCard
        presentation={quickPresentation}
        isExpanded
        onExpandedChange={() => {}}
      />,
    )

    expect(screen.getByText("Unknown")).toBeVisible()
    expect(screen.getAllByText("Example workspace")).toHaveLength(1)
    expect(
      screen.getByRole("region", {
        name: "keyManagement:actions.detailsFor",
      }),
    ).toBeVisible()
  })

  it("keeps copy and export action policies independent", async () => {
    const user = userEvent.setup()
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    const { rerender } = render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: true, exportSecret: false }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    expect(
      screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).not.toBeInTheDocument()

    rerender(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.export" }),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.copyKelivoImportCode",
      }),
    ).toBeVisible()
  })

  it("opens Cursor++ export for an exportable runtime key", async () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.exportToCursorPlus")

    expect(cursorPlusExportDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        account: ACCOUNT,
        runtimeKey,
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Cursor++ export" }),
    )
    expect(
      screen.queryByRole("button", { name: "close Cursor++ export" }),
    ).not.toBeInTheDocument()
  })

  it("redacts credential values from runtime-key Kelivo export errors", async () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new Error("Provider rejected sk-test because the account is suspended"),
    )
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
    expect(JSON.stringify(toastErrorMock.mock.calls)).not.toContain("sk-test")
  })

  it("falls back to the local unknown error for a blank runtime-key Kelivo failure", async () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(ACCOUNT, TOKEN)
    resolveApiTokenKeyMock.mockRejectedValueOnce(new Error(""))
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
  })

  it("uses service-credential analytics for its Kelivo export dialog", async () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(
      SHAREDCHAT_ACCOUNT,
      SHAREDCHAT_SERVICE_CREDENTIAL,
    )
    const user = userEvent.setup()

    render(
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={SHAREDCHAT_ACCOUNT}
      />,
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    expect(kelivoExportDialogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        analyticsContext: expect.objectContaining({
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.CopyServiceCredentialKelivoImportCode,
        }),
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Kelivo export" }),
    )
    expect(
      screen.queryByRole("button", { name: "close Kelivo export" }),
    ).not.toBeInTheDocument()
  })

  it("creates token then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows a create failure when default key creation returns false", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()
  })

  it("shows a one-time key dialog when AIHubMix create returns a full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-created-full-secret",
      name: "aihubmix-default",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(screen.getByText("aihubmix-default")).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-created-full-secret")
    })
  })

  it("keeps AIHubMix saved keys visible without secret-dependent actions", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-created********masked",
        name: "Saved masked key",
      },
    ])

    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    expect(await screen.findByText("Saved masked key")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    const detailsButton = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")

    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).not.toBeInTheDocument()
  })

  it("renders an AIHubMix key without inventing a masked secret", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "",
        name: "Saved key without a preview",
      },
    ])
    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )

    expect(screen.getByText("Saved key without a preview")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
  })

  it("shows OpenRouter native keys read-only and links to full key management", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={onClose}
        account={OPENROUTER_ACCOUNT}
      />,
    )

    expect(await screen.findByText("Example native key")).toBeVisible()
    expect(screen.getByText("Default workspace")).toBeVisible()
    expect(screen.queryByText("sk-or-v1-...example")).not.toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:openRouter.list.actions.edit",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    ).not.toBeInTheDocument()

    const detailsButton = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("sk-or-v1-...example")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "account:actions.keyManagement" }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(openKeysPageMock).toHaveBeenCalledWith(OPENROUTER_ACCOUNT.id)
  })

  it("offers account-level key management from the footer for regular accounts", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<CopyKeyDialog isOpen={true} onClose={onClose} account={ACCOUNT} />)

    expect(
      screen.queryByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).not.toBeInTheDocument()

    const footer = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogFooter,
    )
    await user.click(
      within(footer).getByRole("button", {
        name: "account:actions.keyManagement",
      }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(openKeysPageMock).toHaveBeenCalledWith(ACCOUNT.id)
  })

  it("offers full key management instead of legacy create actions for an empty OpenRouter inventory", async () => {
    listAccountKeyResourcesMock.mockResolvedValueOnce({ items: [] })

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={OPENROUTER_ACCOUNT}
      />,
    )

    expect(await screen.findByText("ui:dialog.copyKey.noKeys")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "account:actions.keyManagement" }),
    ).toBeEnabled()
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps OpenRouter inventory load failures retryable", async () => {
    listAccountKeyResourcesMock
      .mockRejectedValueOnce(new Error("inventory unavailable"))
      .mockResolvedValueOnce({ items: [OPENROUTER_KEY_FACTS] })
    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={OPENROUTER_ACCOUNT}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.retry" }),
    )

    expect(await screen.findByText("Example native key")).toBeVisible()
    expect(listAccountKeyResourcesMock).toHaveBeenCalledTimes(2)
  })

  it("refreshes without auto-copying when AIHubMix create returns a masked key", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...TOKEN, key: "sk-created********masked" }])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-created********masked",
      name: "aihubmix-masked",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.copyKey.createSuccess",
    )
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("refreshes without auto-copying when a create-response-only token has an invalid secret", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...TOKEN, key: "sk-created********masked" }])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: null,
      name: "invalid-created-token",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.copyKey.createSuccess",
    )

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("shows a create error when refreshed inventory is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce(null)
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("invalid_token_payload")).not.toBeInTheDocument()
  })

  it("shows a load error when the initial runtime-key inventory request fails", async () => {
    fetchAccountTokensMock.mockRejectedValueOnce(new Error("load failed"))

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeInTheDocument()
  })

  it("shows a load error when the initial runtime-key inventory is malformed", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce(null)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("invalid_token_payload")).not.toBeInTheDocument()
    expect(screen.queryByText("default")).not.toBeInTheDocument()
  })

  it("keeps the dialog actionable when create fails (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("keeps the dialog actionable when refresh stays empty after create (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    expect(
      await screen.findByText("ui:dialog.copyKey.noKeyFoundAfterCreate"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(3)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows a success toast when refreshed inventory contains multiple tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      TOKEN,
      {
        ...TOKEN,
        id: 2,
        key: "sk-second",
        name: "second",
      },
    ])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "ui:dialog.copyKey.createSuccess",
      )
    })
    expect(await screen.findByText("default")).toBeInTheDocument()
    expect(screen.getByText("second")).toBeInTheDocument()
  })

  it("does not start token creation for accounts without manageable credentials", async () => {
    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("clears loaded tokens when the selected account loses manageable credentials", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    expect(await screen.findByText("default")).toBeInTheDocument()

    rerender(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()
    expect(screen.queryByText("default")).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("ignores stale token fetch completions after the selected account loses manageable credentials", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    await screen.findByText("ui:dialog.copyKey.loading")

    rerender(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()

    await act(async () => {
      pendingTokens.resolve([TOKEN])
      await pendingTokens.promise
    })

    expect(screen.queryByText("default")).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("ignores rejected token fetches after the request is cancelled", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    await screen.findByText("ui:dialog.copyKey.loading")
    rerender(
      <CopyKeyDialog isOpen={false} onClose={() => {}} account={ACCOUNT} />,
    )

    await act(async () => {
      pendingTokens.reject(new Error("cancelled request failed late"))
      await pendingTokens.promise.catch(() => undefined)
    })

    expect(
      screen.queryByText("ui:dialog.copyKey.loadFailed"),
    ).not.toBeInTheDocument()
  })

  it("opens a generic constrained Add Token dialog when default token policy requires selection", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    const user = userEvent.setup()

    const { rerender } = render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: SITE_TYPES.NEW_API,
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByText(
      "messages:tokenProvisioning.createRequiresGroupSelection",
    )
    expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ siteType: SITE_TYPES.NEW_API }),
    )
    expect(createApiTokenMock).not.toHaveBeenCalled()

    rerender(
      <CopyKeyDialog
        isOpen={false}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: SITE_TYPES.NEW_API,
        }}
      />,
    )
    await waitFor(() => {
      expect(
        screen.queryByText(
          "messages:tokenProvisioning.createRequiresGroupSelection",
        ),
      ).not.toBeInTheDocument()
    })
  })

  it("creates a default key with the full policy-resolved token payload", async () => {
    const policyTokenData = {
      name: "Policy Resolved Copy Key",
      remain_quota: 777,
      expired_time: -1,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "vip",
    }

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: policyTokenData,
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.any(Object),
        policyTokenData,
      )
    })
  })

  it("requires manual Sub2API group selection when quick create cannot pick one", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 1 },
      pro: { desc: "Pro", ratio: 1 },
    })

    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: "sub2api",
          sub2apiAuth: {
            jwtToken: "jwt",
            refreshToken: "refresh",
            user: {
              id: "sub-user",
              email: "sub@example.com",
              displayName: "Sub User",
              group: "vip",
              groups: ["vip", "pro"],
            },
          },
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByText(
      "messages:tokenProvisioning.createRequiresGroupSelection",
    )
    expect(fetchUserGroupsMock).toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("copies the resolved full key when inventory is masked", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).toHaveBeenCalledWith("sk-full-secret")
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks Cherry Studio export for a copied account token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openInCherryStudioMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ key: "sk-full-secret" }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("opens an editable Kelivo export dialog for an account token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")
    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(kelivoExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          initialValue: {
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            name: "Example - default",
            baseUrl: "https://example.com",
            apiKey: "sk-full-secret",
          },
        }),
      )
    })
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
  })

  it("reports Cherry Studio export failures without leaving the action pending", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openInCherryStudioMock.mockImplementationOnce(() => {
      throw new Error("Cherry Studio is unavailable")
    })
    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
  })

  it("tracks managed-site single token import when the copied token flow opens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openWithAccountMock.mockImplementationOnce(
      async (_account, _token, onResult) => {
        onResult({ success: false, message: "managed import failed" })
        return { opened: true }
      },
    )

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openWithAccountMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ id: 1 }),
        expect.any(Function),
      )
      expect(toastErrorMock).toHaveBeenCalledWith("managed import failed")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks managed-site import failure when opening the flow rejects", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openWithAccountMock.mockRejectedValueOnce(
      new Error("managed import unavailable"),
    )

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
  })

  it("marks successful managed-site onboarding even when no flow opens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted.mockReset()
    openWithAccountMock.mockImplementationOnce(
      async (_account, _token, onResult) => {
        onResult({ success: true })
        return { opened: false, deferred: false }
      },
    )
    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(
        userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted,
      ).toHaveBeenCalledTimes(1)
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
      )
    })
  })

  it("explains missing external-tool configuration before opening imports", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    userPreferencesContextMock.cliProxyBaseUrl = ""
    userPreferencesContextMock.cliProxyManagementKey = ""
    userPreferencesContextMock.claudeCodeRouterBaseUrl = ""
    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )

    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:cliproxy.configMissing",
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:claudeCodeRouter.configMissing",
    )
    expect(cliProxyDialogMock).not.toHaveBeenCalled()
    expect(claudeCodeRouterDialogMock).not.toHaveBeenCalled()
  })

  it("resets copied state after showing the copied action label", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.copied",
      }),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith("sk-test")

    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
        ).toBeInTheDocument()
      },
      { timeout: 2500 },
    )

    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.copied",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps short secrets masked in the expanded preview", async () => {
    const shortSecret = "abcdefghijklmnopqrstuv"
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: shortSecret,
      },
    ])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )

    expect(screen.queryByText(shortSecret)).not.toBeInTheDocument()
    expect(screen.getByText("abcdefgh****************stuv")).toBeInTheDocument()
  })

  it("renders disabled token state and toggles shared key details", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        status: 2,
        remain_quota: 2000000,
        unlimited_quota: false,
      },
    ])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(await screen.findByText("default")).toBeInTheDocument()
    expect(screen.getByText("common:status.disabled")).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:keyDetails.usedQuota"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:keyDetails.quotaPolicy"),
    ).not.toBeInTheDocument()

    const detailsButton = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("region", {
        name: "keyManagement:actions.detailsFor",
      }),
    ).toBeVisible()
    expect(screen.getByText("keyManagement:keyDetails.usedQuota")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.quotaPolicy"),
    ).toBeVisible()

    await user.click(detailsButton)
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByText("keyManagement:keyDetails.quotaPolicy"),
    ).not.toBeInTheDocument()
  })

  it("exports account tokens to external tools with the account token payload", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )

    await selectExportAction(user, "keyManagement:actions.exportToCCSwitch")
    await waitFor(() => {
      expect(ccSwitchDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({ id: "acc-1" }),
          token: expect.objectContaining({ id: 1, key: "sk-test" }),
        }),
      )
    })

    await selectExportAction(user, "keyManagement:actions.exportToKiloCode")
    await waitFor(() => {
      expect(kiloCodeExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          initialSelectedSiteIds: ["acc-1"],
          initialSelectedTokenIdsBySite: {
            "acc-1": ["1"],
          },
        }),
      )
    })
    act(() => {
      kiloCodeExportDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await waitFor(() => {
      expect(cliProxyDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({ id: "acc-1" }),
          token: expect.objectContaining({ id: 1, key: "sk-test" }),
        }),
      )
    })
    act(() => {
      cliProxyDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )
    await waitFor(() => {
      expect(claudeCodeRouterDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({ id: "acc-1" }),
          token: expect.objectContaining({ id: 1, key: "sk-test" }),
          routerApiKey: "ccr-management-key",
          routerBaseUrl: "https://router.example.invalid",
        }),
      )
    })
    act(() => {
      claudeCodeRouterDialogMock.mock.calls[0]?.[0].onClose()
    })
  })

  it("renders service credential details without token-only quota or expiry metadata", async () => {
    await renderExpandedServiceCredentialDialog()

    expect(
      screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.export" }),
    ).toBeInTheDocument()
    expect(screen.getByText("sk-servi****************cret")).toBeInTheDocument()
    expect(
      screen.queryByText("sk-service-credential-secret"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.copyKey.expireTime"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.copyKey.usedQuota"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.copyKey.remainingQuota"),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("-1")).not.toBeInTheDocument()
  })

  it("exports service credentials with the credential API base URL", async () => {
    openWithCredentialsMock.mockImplementationOnce(
      async (_credential, onResult) => {
        onResult({ success: true, message: "credential import queued" })
        return { deferred: true }
      },
    )
    const user = await renderExpandedServiceCredentialDialog()

    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(openInCherryStudioMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://api.example.invalid/v1",
          name: "SharedChat - Codex service key",
        }),
        expect.objectContaining({
          key: "sk-service-credential-secret",
          name: "SharedChat - Codex service key",
        }),
      )
    })

    await selectExportAction(user, "keyManagement:actions.exportToCCSwitch")
    await waitFor(() => {
      expect(ccSwitchDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
          }),
          token: expect.objectContaining({
            key: "sk-service-credential-secret",
          }),
        }),
      )
    })

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await waitFor(() => {
      expect(cliProxyDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
          }),
          token: expect.objectContaining({
            key: "sk-service-credential-secret",
          }),
          apiTypeHint: API_TYPES.OPENAI_COMPATIBLE,
        }),
      )
    })
    act(() => {
      cliProxyDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )
    await waitFor(() => {
      expect(claudeCodeRouterDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
          }),
          token: expect.objectContaining({
            key: "sk-service-credential-secret",
          }),
          routerApiKey: "ccr-management-key",
          routerBaseUrl: "https://router.example.invalid",
        }),
      )
    })
    act(() => {
      claudeCodeRouterDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")
    await waitFor(() => {
      expect(openWithCredentialsMock).toHaveBeenCalledWith(
        {
          name: "SharedChat - Codex service key",
          baseUrl: "https://api.example.invalid/v1",
          apiKey: "sk-service-credential-secret",
        },
        expect.any(Function),
        {
          managedSiteStatus: undefined,
        },
      )
      expect(openWithAccountMock).not.toHaveBeenCalled()
      expect(toastSuccessMock).toHaveBeenCalledWith("credential import queued")
    })
  }, 30_000)

  it("opens Kilo Code profile export for service credentials", async () => {
    const user = await renderExpandedServiceCredentialDialog()

    await selectExportAction(user, "keyManagement:actions.exportToKiloCode")

    await waitFor(() => {
      expect(kiloCodeProfileExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
            apiKey: "sk-service-credential-secret",
            name: "SharedChat - Codex service key",
          }),
        }),
      )
    })
    act(() => {
      kiloCodeProfileExportDialogMock.mock.calls[0]?.[0].onClose()
    })
    expect(kiloCodeExportDialogMock).not.toHaveBeenCalled()
  })

  it("keeps masked-key copy failures localized to the action and shows the error message", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new Error("masked fetch failed"),
    )

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith("masked fetch failed")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    })
  })

  it("shows the resolver error message when a saved masked key cannot be copied", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new ApiError(
        "messages:errors.tokenSecretUnavailable",
        undefined,
        undefined,
        API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      ),
    )

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.tokenSecretUnavailable",
      )
    })
  })

  it("creates a custom token via AddTokenDialog then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const customCreateButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createCustomKey",
    })
    await user.click(customCreateButton)

    const tokenNameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    await user.clear(tokenNameInput)
    await user.type(tokenNameInput, "My Key")

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "My Key",
      remain_quota: -1,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "default",
    })
  })

  it("shows one-time key dialog for custom AIHubMix AddTokenDialog create returns", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-custom-full-secret",
      name: "My Key",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    )
    const tokenNameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    await user.clear(tokenNameInput)
    await user.type(tokenNameInput, "My Key")
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-custom-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-custom-full-secret")
    })
  })

  it("saves a custom AIHubMix one-time key to an API credential profile without closing the dialog", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-custom-full-secret",
      name: "My Key",
    })
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - My Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
      apiKey: "sk-custom-full-secret",
      tagIds: AIHUBMIX_ACCOUNT.tagIds,
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const onClose = vi.fn()

    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={onClose}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    )
    const tokenNameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    await user.clear(tokenNameInput)
    await user.type(tokenNameInput, "My Key")
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )
    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )

    await waitFor(() => {
      expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
        name: "AIHubMix - My Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
        apiKey: "sk-custom-full-secret",
        tagIds: AIHUBMIX_ACCOUNT.tagIds,
      })
    })
    expect(captureApiCredentialProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: {
          source: "account_token",
          accountId: AIHUBMIX_ACCOUNT.id,
          siteType: SITE_TYPES.AIHUBMIX,
          tokenId: 10,
        },
        linkedBy: "creation-response",
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "keyManagement:messages.savedToApiProfiles",
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-custom-full-secret")
  })
})
