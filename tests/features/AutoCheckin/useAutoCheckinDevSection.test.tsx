import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useAutoCheckinDevSection } from "~/features/AutoCheckin/useAutoCheckinDevSection"
import toast from "~/lib/notify"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
} from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"
import { render } from "~~/tests/test-utils/render"

const {
  sendAutoCheckinMessageMock,
  onRuntimeMessageMock,
  getCurrentTempWindowRequestSourceMock,
} = vi.hoisted(() => ({
  sendAutoCheckinMessageMock: vi.fn(),
  onRuntimeMessageMock: vi.fn(
    (_listener: (message: unknown) => void) => () => {},
  ),
  getCurrentTempWindowRequestSourceMock: vi.fn(),
}))

vi.mock("~/services/checkin/autoCheckin/messaging", () => ({
  sendAutoCheckinMessage: sendAutoCheckinMessageMock,
}))

vi.mock("~/lib/notify", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  getCurrentTempWindowRequestSource: getCurrentTempWindowRequestSourceMock,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    onRuntimeMessage: onRuntimeMessageMock,
  }
})

const PENDING_LABEL_BY_ACTION_ID: Record<string, string> = {
  "trigger-daily-alarm-now":
    "autoCheckin:messages.loading.triggeringDailyAlarm",
  "trigger-retry-alarm-now":
    "autoCheckin:messages.loading.triggeringRetryAlarm",
  "schedule-daily-alarm-for-today":
    "autoCheckin:messages.loading.schedulingDailyAlarmForToday",
  "evaluate-ui-open-pretrigger":
    "autoCheckin:messages.loading.evaluatingUiOpenPretrigger",
  "trigger-ui-open-pretrigger":
    "autoCheckin:messages.loading.triggeringUiOpenPretrigger",
  "reset-last-daily-run-day":
    "autoCheckin:messages.loading.resettingLastDailyRunDay",
}

function DevSectionHarness(props: { refreshStatus?: () => Promise<unknown> }) {
  const { section, isDebugPending } = useAutoCheckinDevSection({
    refreshStatus: props.refreshStatus,
  })

  return (
    <div>
      <span data-testid="debug-pending">{String(isDebugPending)}</span>
      {section.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => void action.run()}
          disabled={action.disabled}
          aria-busy={action.loading || undefined}
        >
          {action.loading
            ? PENDING_LABEL_BY_ACTION_ID[action.id]
            : action.label}
        </button>
      ))}
    </div>
  )
}

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

describe("useAutoCheckinDevSection", () => {
  it("exposes exactly the six alarm/pretrigger debug actions", async () => {
    render(<DevSectionHarness />, RENDER_OPTIONS)

    expect(screen.getAllByRole("button")).toHaveLength(6)
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.debug.triggerDailyAlarmNow",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.debug.triggerRetryAlarmNow",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.debug.scheduleDailyAlarmForToday",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.debug.triggerUiOpenPretrigger",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.debug.resetLastDailyRunDay",
      }),
    ).toBeInTheDocument()
  })

  it("keeps the initiating debug action busy while locking siblings", async () => {
    let attempts = 0
    let release!: () => void
    sendAutoCheckinMessageMock.mockImplementation(async () => {
      attempts += 1
      if (attempts === 1) {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      return { success: true }
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)

    const dailyAlarmButton = await screen.findByRole("button", {
      name: "autoCheckin:execution.debug.triggerDailyAlarmNow",
    })
    fireEvent.click(dailyAlarmButton)

    const pendingButton = await screen.findByRole("button", {
      name: "autoCheckin:messages.loading.triggeringDailyAlarm",
    })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute("aria-busy", "true")
    // The page uses this flag to keep its own toolbar locked during debug work.
    expect(screen.getByTestId("debug-pending")).toHaveTextContent("true")

    const retryAlarmButton = screen.getByRole("button", {
      name: "autoCheckin:execution.debug.triggerRetryAlarmNow",
    })
    expect(retryAlarmButton).toBeDisabled()
    expect(retryAlarmButton).not.toHaveAttribute("aria-busy")

    release()
    const restoredButton = await screen.findByRole("button", {
      name: "autoCheckin:execution.debug.triggerDailyAlarmNow",
    })
    expect(restoredButton).toBeEnabled()
    expect(screen.getByTestId("debug-pending")).toHaveTextContent("false")

    fireEvent.click(restoredButton)
    await waitFor(() => expect(attempts).toBe(2))
    expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
      AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
    )
  })

  it("passes the current temp-window source through the pretrigger actions", async () => {
    getCurrentTempWindowRequestSourceMock.mockReturnValue(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      eligible: true,
      started: false,
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      }),
    )

    // Run sequentially: the first action disables its siblings, so the second
    // click must wait until the first one has finished and re-enabled them.
    const triggerButton = await screen.findByRole("button", {
      name: "autoCheckin:execution.debug.triggerUiOpenPretrigger",
    })
    await waitFor(() => expect(triggerButton).toBeEnabled())
    fireEvent.click(triggerButton)

    const popupExecution = automaticExecution(
      PROTECTION_BYPASS_FEATURES.Checkin,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
      PROTECTION_BYPASS_SURFACES.Popup,
    )
    await waitFor(() => {
      expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
        {
          dryRun: true,
          debug: true,
          protectionBypassExecution: popupExecution,
        },
      )
      expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
        {
          requestId: expect.any(String),
          debug: true,
          protectionBypassExecution: popupExecution,
        },
      )
    })
  })

  it("refreshes the page status after mutating actions succeed", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({ success: true })
    const refreshStatus = vi.fn(async () => undefined)

    render(<DevSectionHarness refreshStatus={refreshStatus} />, RENDER_OPTIONS)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.resetLastDailyRunDay",
      }),
    )

    await waitFor(() => {
      expect(refreshStatus).toHaveBeenCalled()
    })
    expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
      AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
    )
  })

  it.each([
    [
      "autoCheckin:execution.debug.triggerDailyAlarmNow",
      AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
      "autoCheckin:messages.error.dailyAlarmTriggerFailed",
    ],
    [
      "autoCheckin:execution.debug.triggerRetryAlarmNow",
      AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow,
      "autoCheckin:messages.error.retryAlarmTriggerFailed",
    ],
    [
      "autoCheckin:execution.debug.resetLastDailyRunDay",
      AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
      "autoCheckin:messages.error.lastDailyRunDayResetFailed",
    ],
  ])(
    "surfaces the backend message when %s fails",
    async (actionName, messageType, failureKey) => {
      sendAutoCheckinMessageMock.mockResolvedValue({
        success: false,
        error: "alarm unavailable",
      })
      const refreshStatus = vi.fn(async () => undefined)

      render(
        <DevSectionHarness refreshStatus={refreshStatus} />,
        RENDER_OPTIONS,
      )
      fireEvent.click(await screen.findByRole("button", { name: actionName }))

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          expect.stringContaining(failureKey),
        )
      })
      // A failed action must not be reported as a successful refresh.
      expect(refreshStatus).not.toHaveBeenCalled()
      expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(messageType)
    },
  )

  it.each([
    [
      "autoCheckin:execution.debug.triggerDailyAlarmNow",
      "autoCheckin:messages.error.dailyAlarmTriggerFailed",
    ],
    [
      "autoCheckin:execution.debug.triggerRetryAlarmNow",
      "autoCheckin:messages.error.retryAlarmTriggerFailed",
    ],
  ])(
    "surfaces exception details when %s throws",
    async (actionName, failureKey) => {
      sendAutoCheckinMessageMock.mockRejectedValue(new Error("runtime closed"))

      render(<DevSectionHarness />, RENDER_OPTIONS)
      fireEvent.click(await screen.findByRole("button", { name: actionName }))

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          expect.stringContaining(failureKey),
        )
      })
      expect(screen.getByTestId("debug-pending")).toHaveTextContent("false")
    },
  )

  it("reports a failed schedule action with its backend message", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: false,
      error: "window closed",
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.scheduleDailyAlarmForToday",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("dailyAlarmScheduleForTodayFailed"),
      )
    })
    expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
      AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
      { minutesFromNow: 60 },
    )
  })

  it("reports a schedule action that throws", async () => {
    sendAutoCheckinMessageMock.mockRejectedValue(new Error("runtime closed"))

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.scheduleDailyAlarmForToday",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("dailyAlarmScheduleForTodayFailed"),
      )
    })
  })

  it("reports a successful schedule action and refreshes the snapshot", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({ success: true })
    const refreshStatus = vi.fn(async () => undefined)

    render(<DevSectionHarness refreshStatus={refreshStatus} />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.scheduleDailyAlarmForToday",
      }),
    )

    await waitFor(() => {
      expect(refreshStatus).toHaveBeenCalled()
    })
  })

  it("reports an ineligible pre-trigger evaluation with the reason", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      eligible: false,
      ineligibleReason: "outside window",
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("uiOpenPretriggerIneligible"),
      )
    })
  })

  it("reports a failed pre-trigger evaluation", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: false,
      error: "evaluation unavailable",
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("uiOpenPretriggerEvaluationFailed"),
      )
    })
  })

  it("reports a pre-trigger evaluation that throws", async () => {
    sendAutoCheckinMessageMock.mockRejectedValue(new Error("runtime closed"))

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("uiOpenPretriggerEvaluationFailed"),
      )
    })
  })

  it("opens the diagnostics payload when a pre-trigger dry run succeeds", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      eligible: true,
    })
    const onShowUiOpenPretriggerDiagnostics = vi.fn()

    function DiagnosticsHarness() {
      const { section } = useAutoCheckinDevSection({
        onShowUiOpenPretriggerDiagnostics,
      })
      const action = section.actions.find(
        (candidate) => candidate.id === "evaluate-ui-open-pretrigger",
      )
      return (
        <button type="button" onClick={() => void action!.run()}>
          evaluate
        </button>
      )
    }

    render(<DiagnosticsHarness />, RENDER_OPTIONS)
    fireEvent.click(screen.getByRole("button", { name: "evaluate" }))

    await waitFor(() => {
      expect(onShowUiOpenPretriggerDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, eligible: true }),
      )
    })
  })

  it("reports a failed pre-trigger trigger with the backend message", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: false,
      error: "trigger refused",
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.triggerUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("uiOpenPretriggerTriggerFailed"),
      )
    })
  })

  it("reports a pre-trigger trigger that throws", async () => {
    sendAutoCheckinMessageMock.mockRejectedValue(new Error("runtime closed"))

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.triggerUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("uiOpenPretriggerTriggerFailed"),
      )
    })
  })

  it("opens the completion dialog and refreshes when the pre-trigger starts", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      started: true,
      summary: {
        totalEligible: 2,
        executed: 2,
        successCount: 2,
        failedCount: 0,
        skippedCount: 0,
        needsRetry: false,
      },
      pendingRetry: true,
    })
    const refreshStatus = vi.fn(async () => undefined)
    const onShowUiOpenPretriggerCompletion = vi.fn()

    function CompletionHarness() {
      const { section } = useAutoCheckinDevSection({
        refreshStatus,
        onShowUiOpenPretriggerCompletion,
      })
      const action = section.actions.find(
        (candidate) => candidate.id === "trigger-ui-open-pretrigger",
      )
      return (
        <button type="button" onClick={() => void action!.run()}>
          trigger
        </button>
      )
    }

    render(<CompletionHarness />, RENDER_OPTIONS)
    fireEvent.click(screen.getByRole("button", { name: "trigger" }))

    await waitFor(() => {
      expect(onShowUiOpenPretriggerCompletion).toHaveBeenCalledWith({
        isOpen: expect.any(Boolean),
        summary: expect.objectContaining({ executed: 2 }),
        pendingRetry: true,
      })
    })
    expect(refreshStatus).toHaveBeenCalled()
  })

  it("opens diagnostics when the pre-trigger is not eligible to start", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      started: false,
      ineligibleReason: "already ran today",
    })
    const onShowUiOpenPretriggerDiagnostics = vi.fn()

    function DiagnosticsHarness() {
      const { section } = useAutoCheckinDevSection({
        onShowUiOpenPretriggerDiagnostics,
      })
      const action = section.actions.find(
        (candidate) => candidate.id === "trigger-ui-open-pretrigger",
      )
      return (
        <button type="button" onClick={() => void action!.run()}>
          trigger
        </button>
      )
    }

    render(<DiagnosticsHarness />, RENDER_OPTIONS)
    fireEvent.click(screen.getByRole("button", { name: "trigger" }))

    await waitFor(() => {
      expect(onShowUiOpenPretriggerDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ started: false }),
      )
    })
  })

  it("celebrates the pretrigger start broadcast for the matching request", async () => {
    sendAutoCheckinMessageMock.mockImplementation(
      async (_type: string, payload?: { requestId?: string }) => {
        // Simulate the background broadcasting the start for this request.
        startListener?.({
          action: "autoCheckinPretrigger:started",
          requestId: payload?.requestId,
        })
        return { success: true, started: true }
      },
    )
    let startListener: ((message: unknown) => void) | undefined
    onRuntimeMessageMock.mockImplementation(
      (listener: (message: unknown) => void) => {
        startListener = listener
        return () => {}
      },
    )

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.triggerUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalled()
    })
  })
  it.each([
    [
      "autoCheckin:execution.debug.triggerDailyAlarmNow",
      "autoCheckin:messages.error.dailyAlarmTriggerFailed",
    ],
    [
      "autoCheckin:execution.debug.scheduleDailyAlarmForToday",
      "autoCheckin:messages.error.dailyAlarmScheduleForTodayFailed",
    ],
    [
      "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      "autoCheckin:messages.error.uiOpenPretriggerEvaluationFailed",
    ],
    [
      "autoCheckin:execution.debug.triggerUiOpenPretrigger",
      "autoCheckin:messages.error.uiOpenPretriggerTriggerFailed",
    ],
  ])(
    "falls back to an empty error detail when %s fails without one",
    async (actionName, failureKey) => {
      sendAutoCheckinMessageMock.mockResolvedValue({ success: false })

      render(<DevSectionHarness />, RENDER_OPTIONS)
      fireEvent.click(await screen.findByRole("button", { name: actionName }))

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          expect.stringContaining(failureKey),
        )
      })
    },
  )

  it("reports an ineligible pre-trigger evaluation without a reason", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      eligible: false,
    })

    render(<DevSectionHarness />, RENDER_OPTIONS)
    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.debug.evaluateUiOpenPretrigger",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        expect.stringContaining("uiOpenPretriggerIneligible"),
      )
    })
  })

  it("opens the completion dialog with a null summary when none is returned", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      started: true,
    })
    const onShowUiOpenPretriggerCompletion = vi.fn()

    function CompletionHarness() {
      const { section } = useAutoCheckinDevSection({
        onShowUiOpenPretriggerCompletion,
      })
      const action = section.actions.find(
        (candidate) => candidate.id === "trigger-ui-open-pretrigger",
      )
      return (
        <button type="button" onClick={() => void action!.run()}>
          trigger
        </button>
      )
    }

    render(<CompletionHarness />, RENDER_OPTIONS)
    fireEvent.click(screen.getByRole("button", { name: "trigger" }))

    await waitFor(() => {
      expect(onShowUiOpenPretriggerCompletion).toHaveBeenCalledWith({
        isOpen: expect.any(Boolean),
        summary: null,
        pendingRetry: false,
      })
    })
  })
})
