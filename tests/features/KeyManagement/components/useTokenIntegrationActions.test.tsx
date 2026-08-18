import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useTokenIntegrationActions } from "~/features/KeyManagement/components/TokenListItem/useTokenIntegrationActions"
import { AuthTypeEnum } from "~/types"

const {
  completeActionMock,
  loggerErrorMock,
  markOnboardingCompletedMock,
  openWithAccountMock,
  showResultToastMock,
  startActionMock,
  toSanitizedErrorSummaryMock,
} = vi.hoisted(() => ({
  completeActionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  markOnboardingCompletedMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  showResultToastMock: vi.fn(),
  startActionMock: vi.fn(),
  toSanitizedErrorSummaryMock: vi.fn(),
}))

const preferences = {
  claudeCodeRouterApiKey: "router-key",
  claudeCodeRouterBaseUrl: "",
  cliProxyBaseUrl: "",
  cliProxyManagementKey: "",
  managedSiteType: SITE_TYPES.NEW_API,
  markGatewayGuidanceOnboardingCompleted: markOnboardingCompletedMock,
}

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => preferences,
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithAccount: openWithAccountMock }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: vi.fn(),
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

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: showResultToastMock,
}))

const account = {
  id: "account-example",
  name: "Example account",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://account.example.invalid",
  authType: AuthTypeEnum.AccessToken,
  userId: "1",
  token: "account-token",
  cookieAuthSessionCookie: "",
  tagIds: [],
}

const token = {
  id: 7,
  accountId: account.id,
  accountName: account.name,
  key: "sk-example",
  name: "Example key",
  status: 1,
}

const renderActions = (onManagedSiteImportSuccess?: () => Promise<void>) =>
  renderHook(() =>
    useTokenIntegrationActions({
      account: account as never,
      enabled: true,
      onManagedSiteImportSuccess,
      token: token as never,
    }),
  )

describe("useTokenIntegrationActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferences.claudeCodeRouterBaseUrl = ""
    preferences.cliProxyBaseUrl = ""
    preferences.cliProxyManagementKey = ""
    markOnboardingCompletedMock.mockResolvedValue(undefined)
    startActionMock.mockReturnValue({ complete: completeActionMock })
    toSanitizedErrorSummaryMock.mockReturnValue("")
  })

  it("explains missing gateway settings and closes opened dialogs", () => {
    const { result, rerender } = renderActions()

    act(() => result.current.exportActions.openCliProxy())
    act(() => result.current.exportActions.openClaudeCodeRouter())
    expect(showResultToastMock).toHaveBeenCalledWith({
      success: false,
      message: "messages:cliproxy.configMissing",
    })
    expect(showResultToastMock).toHaveBeenCalledWith({
      success: false,
      message: "messages:claudeCodeRouter.configMissing",
    })

    preferences.cliProxyBaseUrl = "https://cli.example.invalid"
    preferences.cliProxyManagementKey = "cli-key"
    preferences.claudeCodeRouterBaseUrl = "https://router.example.invalid"
    rerender()

    act(() => result.current.exportActions.openCliProxy())
    act(() => result.current.exportActions.openClaudeCodeRouter())
    act(() => result.current.exportActions.openKiloCode())
    expect(result.current.dialogs.cliProxy.isOpen).toBe(true)
    expect(result.current.dialogs.claudeCodeRouter.isOpen).toBe(true)
    expect(result.current.dialogs.kiloCode.isOpen).toBe(true)

    act(() => result.current.dialogs.cliProxy.close())
    act(() => result.current.dialogs.claudeCodeRouter.close())
    act(() => result.current.dialogs.kiloCode.close())
    expect(result.current.dialogs.cliProxy.isOpen).toBe(false)
    expect(result.current.dialogs.claudeCodeRouter.isOpen).toBe(false)
    expect(result.current.dialogs.kiloCode.isOpen).toBe(false)
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
    expect(completeActionMock).toHaveBeenCalledWith("failure", {
      errorCategory: "unknown",
    })
  })
})
