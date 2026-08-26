import userEvent from "@testing-library/user-event"
import { vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import * as tokenQuickCreateResolution from "~/services/accounts/tokenQuickCreateResolution"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { render, screen } from "~~/tests/test-utils/render"

import {
  captureApiCredentialProfileMock,
  ccSwitchDialogMock,
  claudeCodeRouterDialogMock,
  cliProxyDialogMock,
  completeProductAnalyticsActionMock,
  createApiCredentialProfileMock,
  createApiTokenMock,
  cursorPlusExportDialogMock,
  fetchAccountAvailableModelsMock,
  fetchAccountTokensMock,
  fetchServiceCredentialMock,
  fetchUserGroupsMock,
  kelivoExportDialogMock,
  kiloCodeExportDialogMock,
  kiloCodeProfileExportDialogMock,
  listAccountKeyResourcesMock,
  openAccountKeyCollectionMock,
  openAccountKeyResourcesMock,
  openInCherryStudioMock,
  openKeysPageMock,
  openWithAccountMock,
  openWithCredentialsMock,
  resolveApiTokenKeyMock,
  resolveDefaultAccountKeyScopeMock,
  startProductAnalyticsActionMock,
  toastErrorMock,
  toastSuccessMock,
  userPreferencesContextMock,
} from "./copyKeyDialogMocks"

const actualResolveDefaultTokenQuickCreateResolution =
  tokenQuickCreateResolution.resolveDefaultTokenQuickCreateResolution

export const resolveDefaultTokenQuickCreateResolutionSpy = vi.spyOn(
  tokenQuickCreateResolution,
  "resolveDefaultTokenQuickCreateResolution",
)

export const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
  tagIds: ["tag-a"],
} as any

export const AIHUBMIX_ACCOUNT = {
  ...ACCOUNT,
  id: "aihubmix-1",
  name: "AIHubMix",
  siteType: SITE_TYPES.AIHUBMIX,
  baseUrl: "https://aihubmix.com",
}

export const OPENROUTER_ACCOUNT = {
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

export const OPENROUTER_KEY_FACTS = {
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

export const TOKEN = {
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

export const SHAREDCHAT_SERVICE_CREDENTIAL = {
  kind: "singleton_service_key" as const,
  service: "codex" as const,
  label: "Codex service key",
  key: "sk-service-credential-secret",
  isAuthenticated: true,
  baseUrl: "https://api.example.invalid/v1",
}

export const SHAREDCHAT_ACCOUNT = {
  ...ACCOUNT,
  id: "sharedchat-account",
  name: "SharedChat",
  siteType: SITE_TYPES.SHAREDCHAT,
  baseUrl: "https://sharedchat.example.invalid",
  authType: AuthTypeEnum.Cookie,
  token: "",
  cookieAuthSessionCookie: "session=example",
} as any

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

export async function renderExpandedServiceCredentialDialog() {
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

export async function selectExportAction(
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

export function setupCopyKeyDialogTestDefaults() {
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
  userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted.mockReset()
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
        return actualResolveDefaultTokenQuickCreateResolution(account, options)
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
}
