import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountAutoDetection } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountAutoDetection"
import type { OpenRouterOnboardingStart } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"

const { onboardRequestyAccount } = vi.hoisted(() => ({
  onboardRequestyAccount: vi.fn(),
}))
vi.mock("~/services/apiAdapters/requesty/account/accountOnboarding", () => ({
  onboardRequestyAccount,
  requestyOnboardingDefaults: { siteType: "requesty" },
  isCanonicalRequestyUrl: (url: string) =>
    new URL(url).origin === "https://app.requesty.ai",
}))

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))
const { notifyInfo, notifyWarning } = vi.hoisted(() => ({
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
}))
vi.mock("~/lib/notify", () => ({
  default: {
    info: notifyInfo,
    warning: notifyWarning,
    success: vi.fn(),
    error: vi.fn(),
  },
}))
vi.mock(
  "~/features/AccountManagement/components/AccountDialog/analytics",
  () => ({
    startAccountDialogAnalyticsAction: () => ({ complete }),
  }),
)
vi.mock("~/utils/browser", async (original) => ({
  ...(await original<typeof import("~/utils/browser")>()),
  isExtensionPopup: () => false,
}))

describe("account detection onboarding outcomes", () => {
  beforeEach(() => vi.clearAllMocks())

  const setup = (start: OpenRouterOnboardingStart) => {
    const hook = renderHook(() =>
      useAccountAutoDetection({ isOpen: true, mode: DIALOG_MODES.ADD }),
    )
    const form = {
      applyDetected: vi.fn().mockResolvedValue(true),
      applyRecovery: vi.fn(),
      enterManual: vi.fn(),
      setAccessToken: vi.fn(),
      beforeDetect: vi.fn(),
      onOpenRouterStarted: vi.fn(),
      onManagementKeyCredentialCreated: vi.fn(),
      setAuthType: vi.fn(),
    }
    const run = (url = "https://openrouter.ai") =>
      hook.result.current.run({
        url,
        mode: DIALOG_MODES.ADD,
        isDetected: false,
        draft: createEmptyAccountDialogDraft(),
        credentialScope: null,
        form,
        onboarding: {
          tryPrepareForStart: () => ({
            clearCreatedCredential: false,
            preparation: { run: (work) => work(start) },
          }),
          abandonForOtherAutoDetect: () => ({ clearCreatedCredential: false }),
        },
      })
    return { ...hook, form, run }
  }

  it("creates and detects Requesty from the automatic onboarding entrypoint", async () => {
    const data = {
      siteType: "requesty",
      accessToken: "created-manage-key",
      checkIn: createEmptyAccountDialogDraft().checkIn,
    }
    onboardRequestyAccount.mockResolvedValueOnce({ success: true, data })
    const { run, form, result } = setup(vi.fn())
    await act(() => run("https://app.requesty.ai/api-keys"))
    expect(onboardRequestyAccount).toHaveBeenCalledOnce()
    expect(form.applyDetected).toHaveBeenCalledWith(data, expect.any(Function))
    expect(form.enterManual).not.toHaveBeenCalled()
    expect(result.current.state.detectionError).toBeNull()
  })

  it("keeps Requesty recovery and its actionable failure in the manual form", async () => {
    const recoveryData = { siteType: "requesty", accessToken: "one-time-key" }
    const detailedError = {
      type: "invalid_response",
      message: "Check the API Keys page before retrying",
    }
    onboardRequestyAccount.mockResolvedValueOnce({
      success: false,
      recoveryData,
      detailedError,
    })
    const { run, form, result } = setup(vi.fn())
    await act(() => run("https://app.requesty.ai"))
    expect(form.applyRecovery).toHaveBeenLastCalledWith(recoveryData, undefined)
    expect(form.enterManual).toHaveBeenCalledOnce()
    expect(result.current.state.detectionError).toEqual(detailedError)
  })

  it("admits only one Requesty create and discards results after a URL change", async () => {
    let finish!: (value: unknown) => void
    let capture!: (credential: string) => void
    onboardRequestyAccount.mockImplementationOnce(({ onCredentialCreated }) => {
      capture = onCredentialCreated
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const { run, form, result } = setup(vi.fn())
    let pending!: Promise<void>
    await act(async () => {
      pending = run("https://app.requesty.ai")
    })
    await act(() => run("https://app.requesty.ai"))
    expect(onboardRequestyAccount).toHaveBeenCalledOnce()
    act(() => result.current.invalidate())
    await act(async () => {
      capture("late-key")
      finish({
        success: true,
        data: { siteType: "requesty", accessToken: "late-key" },
      })
      await pending
    })
    expect(form.applyRecovery.mock.calls).not.toContainEqual([
      expect.objectContaining({ accessToken: "late-key" }),
      expect.anything(),
    ])
    expect(form.applyDetected).not.toHaveBeenCalled()
    expect(form.onManagementKeyCredentialCreated).not.toHaveBeenCalled()
    expect(form.enterManual).not.toHaveBeenCalled()
  })

  it.each([
    ["cancelled_before_dispatch", false, "cancelled"],
    ["ignored", true, "success"],
    ["ignored", false, "failure"],
  ] as const)(
    "records %s with success=%s without applying stale account data",
    async (status, success, outcome) => {
      const start = vi
        .fn<OpenRouterOnboardingStart>()
        .mockResolvedValue({ status, success })
      const { result, form, run } = setup(start)
      await act(run)
      expect(start).toHaveBeenCalledTimes(1)
      expect(complete).toHaveBeenCalledExactlyOnceWith(
        outcome,
        expect.objectContaining({
          insights: expect.objectContaining({ fallbackUsed: false }),
        }),
      )
      expect(form.applyDetected).not.toHaveBeenCalled()
      expect(form.enterManual).not.toHaveBeenCalled()
      expect(result.current.state.isDetecting).toBe(false)
    },
  )

  it("shows manual fallback errors and records safe failure diagnostics", async () => {
    const { result, form, run } = setup(async ({ onManualFallback }) => {
      onManualFallback({
        error: new Error("private-credential"),
        showDetectionError: true,
      })
      return { status: "manual_fallback", success: false }
    })
    await act(run)
    expect(form.enterManual).toHaveBeenCalledTimes(1)
    expect(form.applyDetected).not.toHaveBeenCalled()
    expect(result.current.state.detectionError).not.toBeNull()
    expect(result.current.state.isDetecting).toBe(false)
    expect(complete).toHaveBeenCalledExactlyOnceWith(
      "failure",
      expect.objectContaining({
        diagnostics: {
          failure: expect.objectContaining({ stage: "detection" }),
        },
        insights: expect.objectContaining({ fallbackUsed: true }),
      }),
    )
    expect(JSON.stringify(complete.mock.calls)).not.toContain(
      "private-credential",
    )
  })
})

describe("Requesty credential reuse notice", () => {
  beforeEach(() => vi.clearAllMocks())

  const setup = () => {
    const hook = renderHook(() =>
      useAccountAutoDetection({ isOpen: true, mode: DIALOG_MODES.ADD }),
    )
    const form = {
      applyDetected: vi.fn().mockResolvedValue(true),
      applyRecovery: vi.fn(),
      enterManual: vi.fn(),
      setAccessToken: vi.fn(),
      beforeDetect: vi.fn(),
      onOpenRouterStarted: vi.fn(),
      onManagementKeyCredentialCreated: vi.fn(),
      setAuthType: vi.fn(),
    }
    const run = () =>
      hook.result.current.run({
        url: "https://app.requesty.ai",
        mode: DIALOG_MODES.ADD,
        isDetected: false,
        draft: createEmptyAccountDialogDraft(),
        credentialScope: null,
        form,
        onboarding: {
          tryPrepareForStart: () => ({
            clearCreatedCredential: false,
            preparation: { run: (work) => work(vi.fn()) },
          }),
          abandonForOtherAutoDetect: () => ({ clearCreatedCredential: false }),
        },
      })
    return { form, run }
  }

  it("tells the user when a stored manage key was reused instead of creating one", async () => {
    onboardRequestyAccount.mockResolvedValueOnce({
      success: true,
      message: "accountDialog:form.requestyReusedManageKey",
      data: {
        siteType: "requesty",
        accessToken: "stored-manage-key",
        checkIn: createEmptyAccountDialogDraft().checkIn,
      },
    })
    const { run } = setup()
    await act(run)
    expect(notifyInfo).toHaveBeenCalledExactlyOnceWith(
      "accountDialog:form.requestyReusedManageKey",
    )
  })

  it("stays quiet when the onboarding did create a key", async () => {
    onboardRequestyAccount.mockResolvedValueOnce({
      success: true,
      message: "accountDialog:messages.autoDetectSuccess",
      data: {
        siteType: "requesty",
        accessToken: "created-manage-key",
        checkIn: createEmptyAccountDialogDraft().checkIn,
      },
    })
    const { run } = setup()
    await act(run)
    expect(notifyInfo).not.toHaveBeenCalled()
  })
})
