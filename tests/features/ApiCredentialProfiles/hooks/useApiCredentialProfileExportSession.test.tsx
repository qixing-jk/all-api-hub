import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_CREDENTIAL_PROFILE_EXPORT_ACTIONS } from "~/features/ApiCredentialProfiles/contracts"
import { useApiCredentialProfileExportSession } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfileExportSession"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

const mockOpenWithCredentials = vi.fn()
const mockMarkGatewayGuidanceOnboardingCompleted = vi.fn()
const mockShowResultToast = vi.fn()

let mockClaudeCodeRouterBaseUrl: string | undefined =
  "https://router.example.com"
let mockClaudeCodeRouterApiKey: string | undefined = "router-api-key"

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({
    openWithCredentials: mockOpenWithCredentials,
  }),
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted:
      mockMarkGatewayGuidanceOnboardingCompleted,
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    claudeCodeRouterBaseUrl: mockClaudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey: mockClaudeCodeRouterApiKey,
  }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: vi.fn(),
}))

vi.mock("~/utils/feedback/operationFeedback", () => ({
  showResultToast: (...args: any[]) => mockShowResultToast(...args),
}))

const sampleProfile: ApiCredentialProfile = {
  id: "profile-1",
  name: "Sample Profile",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-sample-key",
  apiType: "openai",
  tagIds: [],
  notes: "",
  createdAt: 1000,
  updatedAt: 1000,
}

describe("useApiCredentialProfileExportSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClaudeCodeRouterBaseUrl = "https://router.example.com"
    mockClaudeCodeRouterApiKey = "router-api-key"
  })

  it("exports to CherryStudio and handles success and error", () => {
    const { result } = renderHook(() => useApiCredentialProfileExportSession())

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CherryStudio,
      )
    })
    expect(OpenInCherryStudio).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: "Sample Profile",
        apiKey: "sk-sample-key",
      }),
    )

    // CherryStudio error branch
    vi.mocked(OpenInCherryStudio).mockImplementationOnce(() => {
      throw new Error("CherryStudio launch failed")
    })
    expect(() => {
      act(() => {
        result.current.handleExport(
          sampleProfile,
          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CherryStudio,
        )
      })
    }).toThrow("CherryStudio launch failed")
  })

  it("handles Kelivo export destination", () => {
    const { result } = renderHook(() => useApiCredentialProfileExportSession())

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.Kelivo,
      )
    })
    expect(result.current.kelivoProfile).toEqual(sampleProfile)

    act(() => {
      result.current.setKelivoProfile(null)
    })
    expect(result.current.kelivoProfile).toBeNull()
  })

  it("handles deeplink export destinations (CCSwitch & AiToolbox)", () => {
    const { result } = renderHook(() => useApiCredentialProfileExportSession())

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CCSwitch,
      )
    })
    expect(result.current.deeplinkExportProfile).toEqual({
      target: API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CCSwitch,
      profile: sampleProfile,
    })

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.AiToolbox,
      )
    })
    expect(result.current.deeplinkExportProfile).toEqual({
      target: API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.AiToolbox,
      profile: sampleProfile,
    })

    act(() => {
      result.current.setDeeplinkExportProfile(null)
    })
    expect(result.current.deeplinkExportProfile).toBeNull()
  })

  it("handles CursorPlus and KiloCode export destinations", () => {
    const { result } = renderHook(() => useApiCredentialProfileExportSession())

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CursorPlus,
      )
    })
    expect(result.current.cursorPlusProfile).toEqual(sampleProfile)

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.KiloCode,
      )
    })
    expect(result.current.kiloCodeProfile).toEqual(sampleProfile)

    act(() => {
      result.current.setCursorPlusProfile(null)
      result.current.setKiloCodeProfile(null)
    })
    expect(result.current.cursorPlusProfile).toBeNull()
    expect(result.current.kiloCodeProfile).toBeNull()
  })

  it("handles ClaudeCodeRouter export destination with and without baseUrl", () => {
    mockClaudeCodeRouterBaseUrl = ""
    const { result, rerender } = renderHook(() =>
      useApiCredentialProfileExportSession(),
    )

    // Without baseUrl
    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ClaudeCodeRouter,
      )
    })
    expect(mockShowResultToast).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      }),
    )
    expect(result.current.claudeCodeRouterProfile).toBeNull()

    // With baseUrl
    mockClaudeCodeRouterBaseUrl = "https://router.local"
    rerender()

    act(() => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ClaudeCodeRouter,
      )
    })
    expect(result.current.claudeCodeRouterProfile).toEqual(sampleProfile)

    act(() => {
      result.current.setClaudeCodeRouterProfile(null)
    })
    expect(result.current.claudeCodeRouterProfile).toBeNull()
  })

  it("handles ManagedSite export on success callback and promise resolution", async () => {
    let capturedCallback: ((result: any) => void) | undefined
    mockOpenWithCredentials.mockImplementation(
      (_credentials: any, callback: any) => {
        capturedCallback = callback
        return Promise.resolve({ opened: true })
      },
    )

    const { result } = renderHook(() => useApiCredentialProfileExportSession())

    await act(async () => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ManagedSite,
      )
    })

    expect(mockOpenWithCredentials).toHaveBeenCalledWith(
      {
        name: sampleProfile.name,
        baseUrl: sampleProfile.baseUrl,
        apiKey: sampleProfile.apiKey,
        apiType: sampleProfile.apiType,
      },
      expect.any(Function),
    )

    // Trigger success callback
    act(() => {
      capturedCallback?.({ success: true })
    })
    expect(mockShowResultToast).toHaveBeenCalledWith({ success: true })
    expect(mockMarkGatewayGuidanceOnboardingCompleted).toHaveBeenCalled()
  })

  it("handles ManagedSite export rejection", async () => {
    mockOpenWithCredentials.mockRejectedValue(new Error("dialog failed"))

    const { result } = renderHook(() => useApiCredentialProfileExportSession())

    await act(async () => {
      result.current.handleExport(
        sampleProfile,
        API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ManagedSite,
      )
    })

    expect(mockShowResultToast).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      }),
    )
  })
})
