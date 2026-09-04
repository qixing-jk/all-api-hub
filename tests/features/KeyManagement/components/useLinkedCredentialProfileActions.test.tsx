import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useLinkedCredentialProfileActions } from "~/features/KeyManagement/components/useLinkedCredentialProfileActions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

const {
  completeActionMock,
  loggerWarnMock,
  markOnboardingCompletedMock,
  openInCherryStudioMock,
  openWithCredentialsMock,
  showResultToastMock,
  startActionMock,
} = vi.hoisted(() => ({
  completeActionMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  markOnboardingCompletedMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  openWithCredentialsMock: vi.fn(),
  showResultToastMock: vi.fn(),
  startActionMock: vi.fn(),
}))

const preferences = {
  claudeCodeRouterApiKey: "router-key",
  claudeCodeRouterBaseUrl: "https://router.example.invalid",
  cliProxyBaseUrl: "https://cli.example.invalid",
  cliProxyManagementKey: "cli-key",
  managedSiteType: "new-api",
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

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithCredentials: openWithCredentialsMock }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: openInCherryStudioMock,
}))

vi.mock("~/services/managedSites/utils/managedSite", () => ({
  getManagedSiteLabel: (_t: unknown, siteType: string) =>
    `managed-site:${siteType}`,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startActionMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ warn: loggerWarnMock }),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: showResultToastMock,
}))

const profile = {
  id: "profile-example",
  name: "Example profile",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://api.example.invalid",
  apiKey: "sk-example-secret",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
} satisfies ApiCredentialProfile

describe("useLinkedCredentialProfileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferences.claudeCodeRouterApiKey = "router-key"
    preferences.claudeCodeRouterBaseUrl = "https://router.example.invalid"
    preferences.cliProxyBaseUrl = "https://cli.example.invalid"
    preferences.cliProxyManagementKey = "cli-key"
    preferences.managedSiteType = "new-api"
    markOnboardingCompletedMock.mockResolvedValue(undefined)
    startActionMock.mockReturnValue({ complete: completeActionMock })
  })

  it("exposes export payloads and owns dialog state", () => {
    const { result } = renderHook(() =>
      useLinkedCredentialProfileActions(profile),
    )

    expect(result.current.exportAccount).toMatchObject({
      name: profile.name,
      baseUrl: profile.baseUrl,
    })
    expect(result.current.exportToken).toMatchObject({ key: profile.apiKey })
    expect(result.current.exportRuntimeKey).toBeDefined()
    expect(result.current.cliProxyPayload).toBeDefined()
    expect(result.current.managedSiteLabel).toBe("managed-site:new-api")

    act(() => result.current.openDialog("verify-api"))
    expect(result.current.activeDialog).toBe("verify-api")
    act(() => result.current.closeDialog())
    expect(result.current.activeDialog).toBeNull()
  })

  it("requires configured CLI integrations before opening their dialogs", () => {
    preferences.cliProxyBaseUrl = " "
    preferences.cliProxyManagementKey = " "
    preferences.claudeCodeRouterBaseUrl = " "
    const { result } = renderHook(() =>
      useLinkedCredentialProfileActions(profile),
    )

    act(() => result.current.handleCliProxy())
    act(() => result.current.handleClaudeCodeRouter())
    expect(showResultToastMock).toHaveBeenCalledTimes(2)
    expect(result.current.activeDialog).toBeNull()

    preferences.cliProxyBaseUrl = "https://cli.example.invalid"
    preferences.cliProxyManagementKey = "cli-key"
    preferences.claudeCodeRouterBaseUrl = "https://router.example.invalid"
    const configured = renderHook(() =>
      useLinkedCredentialProfileActions(profile),
    )

    act(() => configured.result.current.handleCliProxy())
    expect(configured.result.current.activeDialog).toBe("cli-proxy")
    act(() => configured.result.current.handleClaudeCodeRouter())
    expect(configured.result.current.activeDialog).toBe("claude-code-router")
  })

  it("tracks Cherry Studio success and reports safe failures", () => {
    const { result } = renderHook(() =>
      useLinkedCredentialProfileActions(profile),
    )

    act(() => result.current.handleCherryStudio())
    expect(openInCherryStudioMock).toHaveBeenCalledWith(
      result.current.exportAccount,
      result.current.exportToken,
    )
    expect(completeActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    openInCherryStudioMock.mockImplementationOnce(() => {
      throw new Error("desktop bridge unavailable")
    })
    act(() => result.current.handleCherryStudio())
    expect(completeActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
    expect(showResultToastMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false }),
    )
  })

  it("imports the linked credential and records completion or skipped results", async () => {
    openWithCredentialsMock.mockImplementationOnce(
      async (_credential, onResult) => {
        onResult({ success: true, message: "queued" })
        return { opened: true, deferred: false }
      },
    )
    const { result } = renderHook(() =>
      useLinkedCredentialProfileActions(profile),
    )

    await act(() => result.current.handleManagedSiteImport())

    expect(openWithCredentialsMock).toHaveBeenCalledWith(
      {
        name: profile.name,
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
      },
      expect.any(Function),
    )
    expect(showResultToastMock).toHaveBeenCalledWith({
      success: true,
      message: "queued",
    })
    expect(markOnboardingCompletedMock).toHaveBeenCalledOnce()
    expect(completeActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    openWithCredentialsMock.mockResolvedValueOnce({
      opened: false,
      deferred: false,
    })
    await act(() => result.current.handleManagedSiteImport())
    expect(completeActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
  })

  it("reports managed-site failures and logs onboarding persistence failures", async () => {
    markOnboardingCompletedMock.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    openWithCredentialsMock.mockImplementationOnce(
      async (_credential, onResult) => {
        onResult({ success: true })
        return { opened: false, deferred: true }
      },
    )
    const { result } = renderHook(() =>
      useLinkedCredentialProfileActions(profile),
    )

    await act(() => result.current.handleManagedSiteImport())
    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledOnce())

    openWithCredentialsMock.mockRejectedValueOnce(
      new Error("channel unavailable"),
    )
    await act(() => result.current.handleManagedSiteImport())

    expect(completeActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
    expect(showResultToastMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false }),
    )
  })
})
