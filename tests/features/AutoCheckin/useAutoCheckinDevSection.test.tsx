import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useAutoCheckinDevSection } from "~/features/AutoCheckin/useAutoCheckinDevSection"
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
  onRuntimeMessageMock: vi.fn(() => () => {}),
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
})
