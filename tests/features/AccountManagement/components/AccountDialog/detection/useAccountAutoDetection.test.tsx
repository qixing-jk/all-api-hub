import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountAutoDetection } from "~/features/AccountManagement/components/AccountDialog/detection/useAccountAutoDetection"
import type { OpenRouterOnboardingStart } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))
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
      onOpenRouterCredentialCreated: vi.fn(),
      setAuthType: vi.fn(),
    }
    const run = () =>
      hook.result.current.run({
        url: "https://openrouter.ai",
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
