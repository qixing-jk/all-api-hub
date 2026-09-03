import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import { PROTECTION_BYPASS_EXECUTION_VERSION } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

type CheckInDiscoveryResult = Awaited<ReturnType<typeof discoverCheckInMethods>>

const {
  mockAutoDetectAccount,
  mockDiscoverCheckInMethods,
  mockOpenWithAccount,
  mockOpenDefaultTokenQuickCreateDialogForAccount,
} = vi.hoisted(() => ({
  mockAutoDetectAccount: vi.fn(),
  mockDiscoverCheckInMethods: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenDefaultTokenQuickCreateDialogForAccount: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  }),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: mockOpenWithAccount,
    openDefaultTokenQuickCreateDialogForAccount:
      mockOpenDefaultTokenQuickCreateDialogForAccount,
  }),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    startProductAnalyticsAction: vi.fn(() => ({
      complete: vi.fn(),
    })),
  }
})

vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: async (
    command: unknown,
    surface: unknown,
    work: (execution: unknown) => Promise<unknown>,
  ) =>
    work({
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: "user_command",
      command,
      surface,
    }),
}))

vi.mock("~/services/accounts/accountAutoDetection", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountAutoDetection")
    >()
  return {
    ...actual,
    autoDetectAccount: mockAutoDetectAccount,
  }
})

vi.mock("~/services/checkin/autoCheckin/discovery", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/checkin/autoCheckin/discovery")
    >()
  return {
    ...actual,
    discoverCheckInMethods: mockDiscoverCheckInMethods,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog re-detect preservation", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()
  })

  const runBasicAddModeRedetection = async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl("https://new-api.example.invalid")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })
    await act(async () => {
      await result.current.handlers.handleRedetectCheckInMethods()
    })

    return result
  }

  it("keeps redetection local when the account URL is missing", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())

    await act(async () => {
      await result.current.handlers.handleRedetectCheckInMethods()
    })

    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "failed",
      message: "accountDialog:messages.urlRequired",
    })
    expect(mockDiscoverCheckInMethods).not.toHaveBeenCalled()
  })

  it("ignores a redetection result after the requested URL changes", async () => {
    const discoveryDeferred = createDeferred<CheckInDiscoveryResult>()
    mockDiscoverCheckInMethods.mockReturnValueOnce(discoveryDeferred.promise)
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl("https://first.example.invalid")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })

    let redetection!: Promise<void>
    await act(async () => {
      redetection = result.current.handlers.handleRedetectCheckInMethods()
      await Promise.resolve()
    })
    act(() => {
      result.current.setters.setUrl("https://second.example.invalid")
    })
    discoveryDeferred.resolve({
      config: buildCheckInConfig({ automaticExecutionEnabled: true }),
      decision: { outcome: "resolved", methodId: "new-api:daily-checkin" },
      detections: {},
      timedOutMethodIds: [],
    })
    await act(async () => {
      await redetection
    })

    expect(result.current.state.url).toBe("https://second.example.invalid")
    expect(result.current.state.checkInRedetectionFeedback).toBeNull()
  })

  it("prefills detected check-in support on the first add-account auto-detect", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "detected-user",
        accessToken: "detected-token",
        userId: "7",
        exchangeRate: 7,
        siteName: "Detected New API",
        siteType: SITE_TYPES.NEW_API,
        checkIn: buildCheckInConfig({
          automaticExecutionEnabled: true,
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        }),
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://new-api.example.com")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.isDetected).toBe(true)
    expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
    expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(true)
  })

  it("re-detects only check-in methods without rerunning account auto-detection", async () => {
    const detectedCheckIn = buildCheckInConfig({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        lastFullDiscoveryAt: 250,
        methods: {
          "new-api:daily-checkin": {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 250 },
            },
          },
        },
      },
      selection: {
        mode: "automatic",
        methodId: "new-api:daily-checkin",
      },
    })
    mockDiscoverCheckInMethods.mockResolvedValueOnce({
      config: detectedCheckIn,
      decision: { outcome: "resolved", methodId: "new-api:daily-checkin" },
      detections: {
        "new-api:daily-checkin":
          detectedCheckIn.methodKnowledge.methods["new-api:daily-checkin"]!
            .detection,
      },
      timedOutMethodIds: [],
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://new-api.example.invalid")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
      result.current.setters.setUserId("7")
      result.current.setters.setAccessToken("account-token")
    })
    await act(async () => {
      result.current.setters.setCheckIn({
        ...result.current.state.checkIn,
        automaticExecutionEnabled: false,
        customCheckIn: {
          url: "https://check-in.example.invalid",
          redeemUrl: "https://redeem.example.invalid",
          openRedeemWithCheckIn: false,
          isCheckedInToday: false,
        },
      })
    })

    await act(async () => {
      await result.current.handlers.handleRedetectCheckInMethods()
    })

    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(mockDiscoverCheckInMethods).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          site_url: "https://new-api.example.invalid",
          site_type: SITE_TYPES.NEW_API,
          account_info: expect.objectContaining({
            id: "7",
            access_token: "account-token",
          }),
        }),
        request: expect.objectContaining({
          baseUrl: "https://new-api.example.invalid",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "7",
            accessToken: "account-token",
          },
          protectionBypassExecution: expect.objectContaining({
            command: expect.any(String),
          }),
        }),
      }),
    )
    expect(result.current.state.checkIn).toMatchObject({
      automaticExecutionEnabled: false,
      methodKnowledge: detectedCheckIn.methodKnowledge,
      selection: detectedCheckIn.selection,
    })
    expect(result.current.state.checkIn.customCheckIn).toMatchObject({
      url: "https://check-in.example.invalid",
      redeemUrl: "https://redeem.example.invalid",
      openRedeemWithCheckIn: false,
    })
    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "completed",
      decisionOutcome: "resolved",
      selectedMethodDisabled: false,
      saveRequired: false,
      unknownReasons: [],
    })

    act(() => {
      result.current.setters.setUrl("https://changed.example.invalid")
    })
    expect(result.current.state.checkInRedetectionFeedback).toBeNull()
  })

  it("stores persistent feedback when the detected method is disabled by the site", async () => {
    const disabledCheckIn = buildCheckInConfig({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        lastFullDiscoveryAt: 225,
        methods: {
          "new-api:daily-checkin": {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 225 },
            },
            status: {
              outcome: "known",
              availability: "disabled",
              evidence: { source: "probe", observedAt: 225 },
            },
          },
        },
      },
      selection: {
        mode: "automatic",
        methodId: "new-api:daily-checkin",
      },
    })
    mockDiscoverCheckInMethods.mockResolvedValueOnce({
      config: disabledCheckIn,
      decision: { outcome: "resolved", methodId: "new-api:daily-checkin" },
      detections: {
        "new-api:daily-checkin":
          disabledCheckIn.methodKnowledge.methods["new-api:daily-checkin"]!
            .detection,
      },
      timedOutMethodIds: [],
    })

    const result = await runBasicAddModeRedetection()

    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "completed",
      decisionOutcome: "resolved",
      selectedMethodDisabled: true,
      saveRequired: false,
      unknownReasons: [],
    })
  })

  it.each([
    {
      outcome: "ambiguous" as const,
      decision: {
        outcome: "ambiguous" as const,
        methodIds: ["new-api:daily-checkin", "new-api:alternate-checkin"],
      },
    },
    {
      outcome: "unknown" as const,
      decision: { outcome: "unknown" as const },
    },
  ])(
    "stores persistent feedback for $outcome results",
    async ({ decision }) => {
      mockDiscoverCheckInMethods.mockResolvedValueOnce({
        config: buildCheckInConfig({ automaticExecutionEnabled: true }),
        decision,
        detections: {},
        timedOutMethodIds: [],
      })

      const result = await runBasicAddModeRedetection()

      expect(result.current.state.checkInRedetectionFeedback).toEqual({
        kind: "completed",
        decisionOutcome: decision.outcome,
        selectedMethodDisabled: false,
        saveRequired: false,
        unknownReasons: [],
      })
    },
  )

  it("stores an unsupported redetection result", async () => {
    const unsupportedCheckIn = buildCheckInConfig({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        lastFullDiscoveryAt: 250,
        methods: {
          "new-api:daily-checkin": {
            detection: {
              outcome: "unsupported",
              evidence: { source: "probe", observedAt: 250 },
            },
          },
        },
      },
      selection: { mode: "automatic" },
    })
    mockDiscoverCheckInMethods.mockResolvedValueOnce({
      config: unsupportedCheckIn,
      decision: { outcome: "unsupported" },
      detections: {
        "new-api:daily-checkin":
          unsupportedCheckIn.methodKnowledge.methods["new-api:daily-checkin"]!
            .detection,
      },
      timedOutMethodIds: [],
    })

    const result = await runBasicAddModeRedetection()

    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "completed",
      decisionOutcome: "unsupported",
      selectedMethodDisabled: false,
      saveRequired: false,
      unknownReasons: [],
    })
  })

  it("marks edit-mode redetection feedback as requiring a save", async () => {
    const accountId = await accountStorage.addAccount(
      buildSiteAccount({
        site_url: "https://new-api.example.invalid",
        site_type: SITE_TYPES.NEW_API,
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      }),
    )
    mockDiscoverCheckInMethods.mockResolvedValueOnce({
      config: buildCheckInConfig({
        automaticExecutionEnabled: true,
        methodKnowledge: {
          lastFullDiscoveryAt: 275,
          methods: {
            "new-api:daily-checkin": {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: 275 },
              },
            },
          },
        },
        selection: {
          mode: "automatic",
          methodId: "new-api:daily-checkin",
        },
      }),
      decision: { outcome: "resolved", methodId: "new-api:daily-checkin" },
      detections: {},
      timedOutMethodIds: [],
    })

    const account = { id: accountId } as any
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
      expect(result.current.state.url).toBe("https://new-api.example.invalid")
    })

    await act(async () => {
      await result.current.handlers.handleRedetectCheckInMethods()
    })

    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "completed",
      decisionOutcome: "resolved",
      selectedMethodDisabled: false,
      saveRequired: true,
      unknownReasons: [],
    })
  })

  it("reports the concrete reason for inconclusive edit-mode detection without asking to save", async () => {
    const accountId = await accountStorage.addAccount(
      buildSiteAccount({
        site_url: "https://new-api.example.invalid",
        site_type: SITE_TYPES.NEW_API,
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      }),
    )
    const unknownDetection = {
      outcome: "unknown" as const,
      reason: "timeout" as const,
      attemptedAt: 300,
    }
    mockDiscoverCheckInMethods.mockResolvedValueOnce({
      config: buildCheckInConfig({
        automaticExecutionEnabled: true,
        methodKnowledge: {
          lastFullDiscoveryAt: 300,
          methods: {
            "new-api:daily-checkin": { detection: unknownDetection },
          },
        },
      }),
      decision: {
        outcome: "unknown",
        matchedMethodIds: [],
        unknownMethodIds: ["new-api:daily-checkin"],
      },
      detections: { "new-api:daily-checkin": unknownDetection },
      timedOutMethodIds: ["new-api:daily-checkin"],
    })

    const account = { id: accountId } as any
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
      expect(result.current.state.url).toBe("https://new-api.example.invalid")
    })

    await act(async () => {
      await result.current.handlers.handleRedetectCheckInMethods()
    })

    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "completed",
      decisionOutcome: "unknown",
      selectedMethodDisabled: false,
      saveRequired: false,
      unknownReasons: ["timeout"],
    })
  })

  it("keeps redetection failures visible in dialog state", async () => {
    mockDiscoverCheckInMethods.mockRejectedValueOnce(new Error("network down"))

    const result = await runBasicAddModeRedetection()

    expect(result.current.state.checkInRedetectionFeedback).toEqual({
      kind: "failed",
      message: "accountDialog:messages.operationFailed",
    })
  })

  it("reports a redetection failure when no method is selected", async () => {
    mockDiscoverCheckInMethods.mockRejectedValueOnce(new Error("network down"))
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      result.current.setters.setUrl("https://new-api.example.invalid")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })
    await act(async () => {
      result.current.setters.setCheckIn({
        ...result.current.state.checkIn,
        selection: { mode: "automatic" },
      })
    })

    await act(async () => {
      await result.current.handlers.handleRedetectCheckInMethods()
    })

    expect(result.current.state.checkInRedetectionFeedback?.kind).toBe("failed")
  })

  it("preserves notes and custom check-in fields when re-detecting an existing account", async () => {
    const turnstilePreTrigger: TurnstilePreTrigger = {
      kind: "clickSelector",
      selector: "#check-in",
    }

    const existingCheckIn: CheckInConfig = buildCheckInConfig({
      automaticExecutionEnabled: false,
      customCheckIn: {
        url: "https://checkin.example.com",
        redeemUrl: "https://redeem.example.com",
        openRedeemWithCheckIn: false,
        isCheckedInToday: true,
        lastCheckInDate: "2026-03-05",
        turnstilePreTrigger,
      },
    })

    const existingNotes = "Keep this note"

    const accountId = await accountStorage.addAccount({
      site_name: "Test",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "unknown",
      exchange_rate: 7,
      account_info: {
        id: "1",
        access_token: "token",
        username: "user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      notes: existingNotes,
      tagIds: [],
      authType: AuthTypeEnum.AccessToken,
      checkIn: existingCheckIn,
    } as any)

    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "new-user",
        accessToken: "new-token",
        userId: "1",
        exchangeRate: 7,
        siteName: "Detected",
        siteType: SITE_TYPES.NEW_API,
        checkIn: buildCheckInConfig({
          automaticExecutionEnabled: true,
          methodKnowledge: {
            lastFullDiscoveryAt: 200,
            methods: {
              "new-api:daily-checkin": {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: 200 },
                },
              },
            },
          },
          selection: {
            mode: "automatic",
            methodId: "new-api:daily-checkin",
          },
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        }),
      },
    })

    const account = { id: accountId } as any
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state.notes).toBe(existingNotes)
      expect(result.current.state.checkIn.customCheckIn?.url).toBe(
        existingCheckIn.customCheckIn?.url,
      )
      expect(result.current.state.checkIn.customCheckIn?.redeemUrl).toBe(
        existingCheckIn.customCheckIn?.redeemUrl,
      )
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.isDetected).toBe(true)
    })

    expect(result.current.state.notes).toBe(existingNotes)
    expect(result.current.state.checkIn.customCheckIn?.url).toBe(
      existingCheckIn.customCheckIn?.url,
    )
    expect(result.current.state.checkIn.customCheckIn?.redeemUrl).toBe(
      existingCheckIn.customCheckIn?.redeemUrl,
    )
    expect(
      result.current.state.checkIn.customCheckIn?.openRedeemWithCheckIn,
    ).toBe(existingCheckIn.customCheckIn?.openRedeemWithCheckIn)
    expect(
      result.current.state.checkIn.customCheckIn?.turnstilePreTrigger,
    ).toEqual(turnstilePreTrigger)
    expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(
      existingCheckIn.automaticExecutionEnabled,
    )

    const refreshAccountSpy = vi
      .spyOn(accountStorage, "refreshAccount")
      .mockResolvedValue({
        account: buildSiteAccount({ id: accountId }),
        refreshed: false,
      })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })
    await waitFor(() => expect(refreshAccountSpy).toHaveBeenCalledOnce())
    refreshAccountSpy.mockRestore()

    const saved = await accountStorage.getAccountById(accountId)
    expect(saved?.checkIn.methodKnowledge.lastFullDiscoveryAt).toBe(200)
    expect(
      saved?.checkIn.methodKnowledge.methods["new-api:daily-checkin"]
        ?.detection,
    ).toEqual({
      outcome: "matched",
      evidence: { source: "probe", observedAt: 200 },
    })
    expect(saved?.checkIn.selection).toEqual({
      mode: "automatic",
      methodId: "new-api:daily-checkin",
    })
  })

  it("shows a slow-detect hint for long-running auto-detect requests and clears it after completion", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://slow.example.com")
    })

    vi.useFakeTimers()

    try {
      const detectDeferred = createDeferred<AccountAutoDetectResponse>()
      mockAutoDetectAccount.mockReturnValueOnce(detectDeferred.promise)

      let detectPromise!: Promise<void>
      await act(async () => {
        detectPromise = result.current.handlers.handleAutoDetect()
        await Promise.resolve()
      })

      expect(result.current.state.isDetecting).toBe(true)
      expect(result.current.state.isDetectingSlow).toBe(false)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(result.current.state.isDetectingSlow).toBe(true)

      detectDeferred.resolve({
        kind: "detected",
        success: true,
        message: "ok",
        data: {
          username: "detected-user",
          accessToken: "detected-token",
          userId: "1",
          exchangeRate: 7,
          siteName: "Detected Site",
          siteType: "unknown",
          checkIn: buildCheckInConfig(),
        },
      })

      await act(async () => {
        await detectPromise
      })

      expect(result.current.state.isDetecting).toBe(false)
      expect(result.current.state.isDetectingSlow).toBe(false)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(result.current.state.isDetectingSlow).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("forces detected Sub2API accounts back to JWT auth, keeps refresh-token mode opt-in, and disables built-in check-in", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "sub-user",
        accessToken: "jwt-token",
        userId: "9",
        exchangeRate: 7,
        siteName: "Detected Sub2API",
        siteType: "sub2api",
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
        sub2apiAuth: {
          refreshToken: "refresh-token",
          tokenExpiresAt: 123456789,
        },
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      result.current.setters.setCookieAuthSessionCookie("session=abc")
      result.current.setters.setCheckIn(
        buildCheckInConfig({ automaticExecutionEnabled: true }),
      )
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.com")
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
      expect(result.current.state.cookieAuthSessionCookie).toBe("session=abc")
      expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(true)
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe("sub2api")
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
      expect(result.current.state.cookieAuthSessionCookie).toBe("")
      expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(true)
      expect(result.current.state.sub2apiUseRefreshToken).toBe(false)
      expect(result.current.state.sub2apiRefreshToken).toBe("refresh-token")
      expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456789)
    })
  })

  it("keeps the current site type when auto-detect returns an invalid site type", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "detected-user",
        accessToken: "detected-token",
        userId: "4",
        exchangeRate: 7,
        siteName: "Detected Site",
        siteType: "legacy-invalid-site",
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://legacy.example.com")
      result.current.setters.setSiteType(SITE_TYPES.VELOERA)
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.VELOERA)
    expect(result.current.state.username).toBe("detected-user")
    expect(result.current.state.accessToken).toBe("detected-token")
    expect(result.current.state.isDetected).toBe(true)
  })

  it("stops auto-detect when the duplicate-account warning is canceled", async () => {
    await accountStorage.addAccount(
      buildSiteAccount({
        site_name: "Existing",
        site_url: "https://api.example.com",
      }),
    )

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://api.example.com/users")
    })

    let detectPromise!: Promise<void>
    act(() => {
      detectPromise = result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning).toMatchObject({
        isOpen: true,
        siteUrl: "https://api.example.com",
      })
    })

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningCancel()
      await detectPromise
    })

    expect(mockAutoDetectAccount).not.toHaveBeenCalled()
    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)
    expect(result.current.state.isDetecting).toBe(false)
    expect(result.current.state.isDetected).toBe(false)
    expect(result.current.state.showManualForm).toBe(false)
  })

  it("uses a detected site type to prepare manual completion after auto-detect fails", async () => {
    const detailedError = {
      type: AutoDetectErrorType.UNAUTHORIZED,
      message: "Login required",
      actionText: "Log in",
      helpDocUrl: "https://docs.example.com/auto-detect",
    }

    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      detailedError,
      autoDetectContext: {
        siteType: SITE_TYPES.NEW_API,
      },
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        siteName: "Detected portal",
        username: "detected-user",
        userId: "42",
        accessToken: "detected-access-token",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=detected-cookie",
        transientAuth: {
          kind: "new-api-dashboard-bearer",
          token: "temporary-dashboard-token",
          expiresAt: 4_102_444_800,
          sessionId: "recovery-session",
          origin: "https://failing.example.com",
        },
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://failing.example.com")
      result.current.setters.setSiteName("My relay")
      result.current.setters.setUsername("my-user")
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://failing.example.com")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.detectionError).toEqual(detailedError)
    expect(result.current.state.showManualForm).toBe(true)
    expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
    expect(result.current.state.siteName).toBe("My relay")
    expect(result.current.state.username).toBe("my-user")
    expect(result.current.state.userId).toBe("42")
    expect(result.current.state.accessToken).toBe("detected-access-token")
    expect(result.current.state.cookieAuthSessionCookie).toBe(
      "session=detected-cookie",
    )
    expect(result.current.state.url).toBe("https://failing.example.com")
    expect(result.current.state.isDetected).toBe(false)
    expect(result.current.state.isDetecting).toBe(false)
  })

  it("ignores recovery from an auto-detect request after the URL changes", async () => {
    const detectDeferred = createDeferred<AccountAutoDetectResponse>()
    mockAutoDetectAccount.mockReturnValueOnce(detectDeferred.promise)

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://first.example.invalid")
    })

    let detectPromise!: Promise<void>
    await act(async () => {
      detectPromise = result.current.handlers.handleAutoDetect()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockAutoDetectAccount).toHaveBeenCalledWith(
        "https://first.example.invalid",
        AuthTypeEnum.AccessToken,
        expect.anything(),
        undefined,
      )
    })

    act(() => {
      result.current.setters.setUrl("https://second.example.invalid")
    })
    detectDeferred.resolve({
      kind: "detected",
      success: false,
      message: "Detection incomplete",
      detailedError: {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message: "Detection incomplete",
      },
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        userId: "42",
        accessToken: "first-site-token",
      },
    })

    await act(async () => {
      await detectPromise
    })

    expect(result.current.state.url).toBe("https://second.example.invalid")
    expect(result.current.state.showManualForm).toBe(false)
    expect(result.current.state.detectionError).toBeNull()
    expect(result.current.state.userId).toBe("")
    expect(result.current.state.accessToken).toBe("")
  })

  it("ignores recovery from an auto-detect request after the dialog reopens", async () => {
    const detectDeferred = createDeferred<AccountAutoDetectResponse>()
    mockAutoDetectAccount.mockReturnValueOnce(detectDeferred.promise)

    const prefill = {
      source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
      siteUrl: "https://first.example.invalid",
      siteType: SITE_TYPES.UNKNOWN,
    } as const
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen,
          prefill,
          onClose: vi.fn(),
          onSuccess: vi.fn(),
        }),
      { initialProps: { isOpen: true } },
    )

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://first.example.invalid")
    })

    let detectPromise!: Promise<void>
    await act(async () => {
      detectPromise = result.current.handlers.handleAutoDetect()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockAutoDetectAccount).toHaveBeenCalledOnce()
    })

    rerender({ isOpen: false })
    rerender({ isOpen: true })
    await waitFor(() => {
      expect(result.current.state.url).toBe("https://first.example.invalid")
    })
    detectDeferred.resolve({
      kind: "detected",
      success: false,
      message: "Detection incomplete",
      detailedError: {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message: "Detection incomplete",
      },
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        userId: "42",
        accessToken: "first-session-token",
      },
    })

    await act(async () => {
      await detectPromise
    })

    expect(result.current.state.showManualForm).toBe(false)
    expect(result.current.state.detectionError).toBeNull()
    expect(result.current.state.userId).toBe("")
    expect(result.current.state.accessToken).toBe("")
  })

  it("recovers Sub2API refresh credentials for manual completion after auto-detect fails", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      detailedError: {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message: "Detection incomplete",
      },
      recoveryData: {
        siteType: SITE_TYPES.SUB2API,
        username: "detected-sub-user",
        userId: "9",
        accessToken: "detected-jwt-token",
        authType: AuthTypeEnum.AccessToken,
        sub2apiAuth: {
          refreshToken: "detected-refresh-token",
          tokenExpiresAt: 123456789,
        },
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.invalid")
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://sub2.example.invalid")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.showManualForm).toBe(true)
    expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
    expect(result.current.state.username).toBe("detected-sub-user")
    expect(result.current.state.userId).toBe("9")
    expect(result.current.state.accessToken).toBe("detected-jwt-token")
    expect(result.current.state.sub2apiUseRefreshToken).toBe(true)
    expect(result.current.state.sub2apiRefreshToken).toBe(
      "detected-refresh-token",
    )
    expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456789)
  })

  it("does not replace an explicitly selected site type after auto-detect fails", async () => {
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: false,
      detailedError: {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message: "Detection incomplete",
      },
      autoDetectContext: {
        siteType: SITE_TYPES.NEW_API,
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://failing.example.com")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.SUB2API)
    expect(result.current.state.showManualForm).toBe(true)
  })

  it("auto-imports cookie auth headers after a successful cookie-based auto-detect", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: " session=abc123 ",
    })
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "cookie-user",
        accessToken: "detected-token",
        userId: "12",
        siteName: "Detected Cookie Site",
        siteType: "new-api",
        checkIn: buildCheckInConfig(),
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 101,
          origin: "https://cookie.example.com",
          incognito: true,
          cookieStoreId: " 1-incognito ",
        },
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://cookie.example.com")
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      result.current.setters.setExchangeRate("7")
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://cookie.example.com")
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
      expect(result.current.state.exchangeRate).toBe("7")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://cookie.example.com",
        cookieStoreId: "1-incognito",
      }),
    )
    expect(result.current.state.cookieAuthSessionCookie).toBe("session=abc123")
    expect(result.current.state.showCookiePermissionWarning).toBe(false)
    expect(result.current.state.exchangeRate).toBe("")
    expect(result.current.state.isDetected).toBe(true)

    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: " session=manual ",
    })

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(sendRuntimeMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://cookie.example.com",
        cookieStoreId: "1-incognito",
      }),
    )
    expect(result.current.state.cookieAuthSessionCookie).toBe(
      " session=manual ",
    )
  })

  it("shows backend cookie import errors and toggles manual form visibility", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: "blocked by browser",
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://cookie.example.com")
      result.current.setters.setShowManualForm(true)
    })

    expect(result.current.state.showManualForm).toBe(true)

    await act(async () => {
      result.current.setters.setShowManualForm(false)
    })

    expect(result.current.state.showManualForm).toBe(false)

    await act(async () => {
      await result.current.handlers.handleImportCookieAuthSessionCookie()
    })

    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesFailed",
    )
  })

  it("switches AIHubMix auto-detect results to access-token mode and skips cookie import", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "aihubmix-user",
        accessToken: "aihubmix-access-token",
        userId: "21",
        siteName: "AIHubMix",
        siteType: SITE_TYPES.AIHUBMIX,
        authType: AuthTypeEnum.AccessToken,
        exchangeRate: 7,
        checkIn: buildCheckInConfig(),
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://console.aihubmix.com")
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      result.current.setters.setCookieAuthSessionCookie("session=old")
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.siteType).toBe(SITE_TYPES.AIHUBMIX)
    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    expect(result.current.state.accessToken).toBe("aihubmix-access-token")
    expect(result.current.state.cookieAuthSessionCookie).toBe("")
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("keeps detection successful but shows the permission warning when cookie auto-import is denied", async () => {
    const { sendRuntimeMessage } = await import("~/utils/browser/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
    })
    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "cookie-user",
        accessToken: "detected-token",
        userId: "18",
        siteName: "Detected Cookie Site",
        siteType: "new-api",
        exchangeRate: 7,
        checkIn: buildCheckInConfig(),
      },
    })

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://cookie.example.com")
      result.current.setters.setAuthType(AuthTypeEnum.Cookie)
    })

    await waitFor(() => {
      expect(result.current.state.url).toBe("https://cookie.example.com")
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    expect(result.current.state.isDetected).toBe(true)
    expect(result.current.state.cookieAuthSessionCookie).toBe("")
    expect(result.current.state.showCookiePermissionWarning).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.importCookiesPermissionDenied",
    )
  })
})
