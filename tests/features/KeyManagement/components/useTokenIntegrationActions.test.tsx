import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useRuntimeKeyIntegrationActions } from "~/features/KeyManagement/components/RuntimeKeyActions/useRuntimeKeyIntegrationActions"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/factories"

const {
  completeActionMock,
  loggerErrorMock,
  markOnboardingCompletedMock,
  openWithAccountMock,
  resolveSecretMock,
  showResultToastMock,
  startActionMock,
  toSanitizedErrorSummaryMock,
} = vi.hoisted(() => ({
  completeActionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  markOnboardingCompletedMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  resolveSecretMock: vi.fn(),
  showResultToastMock: vi.fn(),
  startActionMock: vi.fn(),
  toSanitizedErrorSummaryMock: vi.fn(),
}))

const preferences = {
  claudeCodeRouterApiKey: "router-key",
  claudeCodeRouterBaseUrl: "",
  cliProxyApiBaseUrl: "",
  cliProxyApiManagementKey: "",
  managedSiteType: SITE_TYPES.NEW_API,
  markGatewayGuidanceOnboardingCompleted: markOnboardingCompletedMock,
}

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => preferences,
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: markOnboardingCompletedMock,
  }),
}))

vi.mock("~/features/ManagedSiteChannels/editor/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithAccount: openWithAccountMock }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: resolveSecretMock,
}))

vi.mock("~/services/managedSites/utils/managedSite", () => ({
  getManagedSiteLabel: (_t: unknown, siteType: string) =>
    `managed-site:${siteType}`,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startActionMock,
}))

vi.mock("~/services/verification/aiApiVerification/utils", () => ({
  toSanitizedErrorSummary: toSanitizedErrorSummaryMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ error: loggerErrorMock }),
}))

vi.mock("~/utils/feedback/operationFeedback", () => ({
  showResultToast: showResultToastMock,
}))

const account = {
  id: "account-example",
  name: "Example account",
  username: "example-user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://account.example.invalid",
  authType: AuthTypeEnum.AccessToken,
  userId: "1",
  token: "account-token",
  cookieAuthSessionCookie: "",
  tagIds: [],
  checkIn: buildCheckInConfig(),
} satisfies DisplaySiteData

const token = {
  id: 7,
  user_id: 1,
  created_time: 1,
  accessed_time: 1,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: false,
  used_quota: 0,
  key: "sk-example",
  name: "Example key",
  status: 1,
} satisfies NewApiToken

const renderActions = (onManagedSiteImportSuccess?: () => Promise<void>) =>
  renderHook(() =>
    useRuntimeKeyIntegrationActions({
      account,
      enabled: true,
      onManagedSiteImportSuccess,
      runtimeKey: buildNewApiRuntimeKey(account, token),
    }),
  )

describe("useRuntimeKeyIntegrationActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferences.claudeCodeRouterBaseUrl = ""
    preferences.cliProxyApiBaseUrl = ""
    preferences.cliProxyApiManagementKey = ""
    markOnboardingCompletedMock.mockResolvedValue(undefined)
    startActionMock.mockReturnValue({ complete: completeActionMock })
    toSanitizedErrorSummaryMock.mockReturnValue("")
  })

  it("explains missing gateway settings and closes opened dialogs", () => {
    const { result, rerender } = renderActions()

    act(() => result.current.exportActions.openClaudeCodeRouter())
    expect(showResultToastMock).toHaveBeenCalledWith({
      success: false,
      message: "messages:claudeCodeRouter.configMissing",
    })
    expect(result.current.dialogs.claudeCodeRouter.isOpen).toBe(false)

    preferences.cliProxyApiBaseUrl = "https://cli.example.invalid"
    preferences.cliProxyApiManagementKey = "cli-key"
    preferences.claudeCodeRouterBaseUrl = "https://router.example.invalid"
    rerender()

    act(() => result.current.exportActions.openClaudeCodeRouter())
    act(() => result.current.exportActions.openKiloCode())
    expect(result.current.dialogs.claudeCodeRouter.isOpen).toBe(true)
    expect(result.current.dialogs.kiloCode.isOpen).toBe(true)

    act(() => result.current.dialogs.claudeCodeRouter.close())
    act(() => result.current.dialogs.kiloCode.close())
    expect(result.current.dialogs.claudeCodeRouter.isOpen).toBe(false)
    expect(result.current.dialogs.kiloCode.isOpen).toBe(false)
  })

  // A split-origin deployment answers its API on a different origin than the
  // dashboard, so an external integration must be told the API origin even
  // though the account is addressed by the dashboard URL.
  // See .scratch/ai-router-adaptation/research.md.
  it("exports split-origin accounts with the deployment API origin", async () => {
    const splitOriginAccount = {
      ...account,
      id: "ai-router-account",
      name: "Split origin account",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://ai-router.dev",
    } satisfies DisplaySiteData
    const splitOriginKey = buildNewApiRuntimeKey(splitOriginAccount, token)
    resolveSecretMock.mockResolvedValue({
      ...splitOriginKey,
      secret: "sk-example",
    })

    const { result } = renderHook(() =>
      useRuntimeKeyIntegrationActions({
        account: splitOriginAccount,
        enabled: true,
        runtimeKey: splitOriginKey,
      }),
    )

    await act(async () => {
      await result.current.exportActions.openCherryStudio()
    })
    expect(vi.mocked(OpenInCherryStudio)).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://api.ai-router.dev" }),
    )

    await act(async () => {
      await result.current.exportActions.openKelivo()
    })
    expect(result.current.dialogs.kelivo.input).toMatchObject({
      baseUrl: "https://api.ai-router.dev",
    })
  })

  it("exports an inherited key through the current account endpoint after an account address edit", async () => {
    const inheritedKey = buildNewApiRuntimeKey(account, token)
    const editedAccount = {
      ...account,
      baseUrl: "https://edited.example.invalid",
    }
    resolveSecretMock.mockResolvedValue({
      ...inheritedKey,
      secret: "sk-example",
    })
    const { result } = renderHook(() =>
      useRuntimeKeyIntegrationActions({
        account: editedAccount,
        enabled: true,
        runtimeKey: inheritedKey,
      }),
    )
    await act(async () => {
      await result.current.exportActions.openCherryStudio()
      await result.current.exportActions.openKelivo()
    })
    expect(vi.mocked(OpenInCherryStudio)).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: editedAccount.baseUrl }),
    )
    expect(result.current.dialogs.kelivo.input).toMatchObject({
      baseUrl: editedAccount.baseUrl,
    })
  })

  it("exports a key-specific gateway URL through Cherry Studio and Kelivo", async () => {
    const kimiAccount = {
      ...account,
      siteType: SITE_TYPES.KIMI,
      baseUrl: "https://platform.kimi.com",
    } satisfies DisplaySiteData
    const kimiKey = buildAccountKeyResourceRuntimeKey(kimiAccount, {
      ref: {
        accountId: kimiAccount.id,
        siteType: SITE_TYPES.KIMI,
        scopeKey: "project-1",
        resourceId: "key-1",
      },
      label: "Kimi key",
      secret: "",
      baseUrl: "https://gateway.example.invalid/v1",
    })
    resolveSecretMock.mockResolvedValue({ ...kimiKey, secret: "sk-example" })
    const { result } = renderHook(() =>
      useRuntimeKeyIntegrationActions({
        account: kimiAccount,
        enabled: true,
        runtimeKey: kimiKey,
      }),
    )

    await act(async () => {
      await result.current.exportActions.openCherryStudio()
      await result.current.exportActions.openKelivo()
    })

    expect(vi.mocked(OpenInCherryStudio)).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://gateway.example.invalid" }),
    )
    expect(result.current.dialogs.kelivo.input).toMatchObject({
      baseUrl: "https://gateway.example.invalid",
    })
  })

  it("clears an open export and discards a pending export when the key endpoint changes", async () => {
    let key = {
      ...buildNewApiRuntimeKey(account, token),
      baseUrl: "https://first.example/v1",
    }
    resolveSecretMock.mockResolvedValue(key)
    const { result, rerender } = renderHook(() =>
      useRuntimeKeyIntegrationActions({
        account,
        enabled: true,
        runtimeKey: key,
      }),
    )
    await act(() => result.current.exportActions.openKelivo())
    expect(result.current.dialogs.kelivo.input).toMatchObject({
      baseUrl: "https://first.example",
    })
    let finish!: (value: typeof key) => void
    resolveSecretMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = result.current.exportActions.openKelivo()
    const oldKey = key
    key = { ...key, baseUrl: "https://second.example/v1" }
    rerender()
    expect(result.current.dialogs.kelivo.input).toBeNull()
    await act(async () => {
      finish(oldKey)
      await pending
    })
    expect(result.current.dialogs.kelivo.input).toBeNull()
  })

  it("isolates a rejecting post-import callback", async () => {
    const callbackError = new Error("refresh failed")
    const onManagedSiteImportSuccess = vi.fn().mockRejectedValue(callbackError)
    openWithAccountMock.mockImplementationOnce(
      async (_account, _token, onResult: (result: unknown) => void) => {
        onResult({ success: true })
        return { opened: true, deferred: false }
      },
    )
    const { result } = renderActions(onManagedSiteImportSuccess)

    await act(() => result.current.managedSiteImport.onImport())

    await waitFor(() =>
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "Managed-site import success callback failed",
        callbackError,
      ),
    )
    expect(completeActionMock).toHaveBeenCalledWith("success")
  })

  it("uses the local unknown fallback when import errors have no safe detail", async () => {
    openWithAccountMock.mockRejectedValueOnce(new Error("secret account-token"))
    const { result } = renderActions()

    await act(() => result.current.managedSiteImport.onImport())

    expect(showResultToastMock).toHaveBeenCalledWith({
      success: false,
      message: "messages:errors.operation.failed",
    })
    expect(showResultToastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("account-token"),
      }),
    )
    expect(completeActionMock).toHaveBeenCalledWith("failure", {
      errorCategory: "unknown",
    })
  })
})
